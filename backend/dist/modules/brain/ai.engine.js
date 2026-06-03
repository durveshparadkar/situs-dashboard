import OpenAI from "openai";
import crypto from "crypto";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   OPENAI CLIENT (lazy-initialized, singleton)
===================================================== */
let _openaiClient = null;
function getOpenAIClient() {
    if (_openaiClient)
        return _openaiClient;
    if (!process.env.OPENAI_API_KEY)
        return null;
    _openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 15_000,
        maxRetries: 0, // we handle retries ourselves with backoff
    });
    return _openaiClient;
}
/* =====================================================
   CONFIG
===================================================== */
const CONFIG = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.1,
    maxTokens: 300,
    timeoutMs: 15_000,
    // Retry policy
    maxRetries: 2,
    initialBackoffMs: 500,
    maxBackoffMs: 4_000,
    // Cache (in-memory; swap to Redis for multi-instance deployments)
    cacheEnabled: true,
    cacheTtlMs: 5 * 60 * 1_000, // 5 minutes
    cacheMaxEntries: 1_000,
    // Cost / safety circuit breaker
    circuitBreakerThreshold: 5, // 5 consecutive failures
    circuitBreakerCooldownMs: 60_000, // 1 minute cooldown
};
class PredictionCache {
    store = new Map();
    hash(input) {
        // Deterministic hash of the input — same input = same key
        const normalized = JSON.stringify({
            leadScore: input.leadScore,
            stage: input.stage,
            stageProbability: input.stageProbability,
            daysSinceLastActivity: Math.floor(input.daysSinceLastActivity),
            activityCount: input.activityCount,
            signals: [...input.signals].sort(),
            dealValue: input.dealValue ?? 0,
        });
        return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
    }
    get(input) {
        const key = this.hash(input);
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        // LRU: refresh position
        this.store.delete(key);
        this.store.set(key, entry);
        return entry.value;
    }
    set(input, value) {
        const key = this.hash(input);
        // Evict oldest if at capacity
        if (this.store.size >= CONFIG.cacheMaxEntries) {
            const firstKey = this.store.keys().next().value;
            if (firstKey)
                this.store.delete(firstKey);
        }
        this.store.set(key, {
            value,
            expiresAt: Date.now() + CONFIG.cacheTtlMs,
        });
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size;
    }
}
const cache = new PredictionCache();
/* =====================================================
   CIRCUIT BREAKER
   Stops calling OpenAI after N consecutive failures.
   Saves cost and prevents cascading latency.
===================================================== */
class CircuitBreaker {
    failures = 0;
    openedAt = null;
    isOpen() {
        if (this.openedAt === null)
            return false;
        if (Date.now() - this.openedAt > CONFIG.circuitBreakerCooldownMs) {
            // Half-open: allow next call to test if service recovered
            this.openedAt = null;
            this.failures = 0;
            return false;
        }
        return true;
    }
    recordSuccess() {
        this.failures = 0;
        this.openedAt = null;
    }
    recordFailure() {
        this.failures++;
        if (this.failures >= CONFIG.circuitBreakerThreshold) {
            this.openedAt = Date.now();
            dbLogger.warn(`AI predictor circuit breaker OPENED after ${this.failures} failures`);
        }
    }
    reset() {
        this.failures = 0;
        this.openedAt = null;
    }
}
const circuitBreaker = new CircuitBreaker();
/* =====================================================
   HELPERS
===================================================== */
function safeJSONParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match)
            return null;
        try {
            return JSON.parse(match[0]);
        }
        catch {
            return null;
        }
    }
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
/**
 * Heuristic fallback prediction when AI is unavailable.
 * Better than returning null — your dashboard always shows something.
 */
function heuristicFallback(input) {
    // Base probability from the stage
    let probability = input.stageProbability;
    // Adjust for engagement
    if (input.daysSinceLastActivity > 14)
        probability *= 0.6;
    else if (input.daysSinceLastActivity > 7)
        probability *= 0.8;
    if (input.activityCount < 2)
        probability *= 0.7;
    else if (input.activityCount > 10)
        probability = Math.min(probability * 1.1, 100);
    // Adjust for lead score
    probability = (probability * 0.7) + (input.leadScore * 0.3);
    probability = clamp(probability, 0, 100);
    // Risk level from probability + activity
    let riskLevel;
    if (probability >= 60 && input.daysSinceLastActivity < 7)
        riskLevel = "low";
    else if (probability >= 35)
        riskLevel = "medium";
    else
        riskLevel = "high";
    const actions = [];
    if (input.daysSinceLastActivity > 7)
        actions.push("Re-engage with personalized email");
    if (input.activityCount < 3)
        actions.push("Schedule discovery call");
    if (probability < 40)
        actions.push("Re-qualify lead fit");
    if (input.signals.length > 0)
        actions.push("Address surfaced risk signals");
    if (!actions.length)
        actions.push("Continue current cadence");
    return {
        predictedCloseProbability: Math.round(probability),
        riskLevel,
        reasoning: "Heuristic prediction (AI unavailable)",
        nextBestActions: actions.slice(0, 5),
    };
}
/**
 * Validate and sanitize the parsed AI response.
 * Returns null if the response is malformed.
 */
function validateAIResponse(parsed) {
    const probability = Number(parsed.predictedCloseProbability);
    const riskLevel = parsed.riskLevel;
    if (Number.isNaN(probability))
        return null;
    if (!["low", "medium", "high"].includes(riskLevel))
        return null;
    return {
        predictedCloseProbability: clamp(Math.round(probability), 0, 100),
        riskLevel: riskLevel,
        reasoning: String(parsed.reasoning ?? "").slice(0, 500),
        nextBestActions: Array.isArray(parsed.nextBestActions)
            ? parsed.nextBestActions
                .filter(a => typeof a === "string" && a.length > 0)
                .slice(0, 5)
            : [],
    };
}
/* =====================================================
   PROMPT BUILDER
===================================================== */
function buildPrompt(input) {
    return `Analyze this sales lead and return ONLY valid JSON. No markdown, no explanations outside JSON.

Lead data:
- Lead score: ${input.leadScore}/100
- Current stage: ${input.stage} (typical close rate: ${input.stageProbability}%)
- Days since last activity: ${input.daysSinceLastActivity}
- Total activities: ${input.activityCount}
- Risk signals detected: ${input.signals.length ? input.signals.join(", ") : "none"}
${input.dealValue ? `- Deal value: ₹${input.dealValue.toLocaleString("en-IN")}` : ""}

Return this exact JSON shape:
{
  "predictedCloseProbability": <number 0-100>,
  "riskLevel": "low" | "medium" | "high",
  "reasoning": "<one short sentence>",
  "nextBestActions": ["<action 1>", "<action 2>", "<action 3>"]
}

Be concise. Reasoning under 200 chars. Max 3 actions.`;
}
/* =====================================================
   CORE OPENAI CALL (with retries + backoff)
===================================================== */
async function callOpenAIWithRetry(client, input) {
    const prompt = buildPrompt(input);
    let lastError = null;
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model: CONFIG.model,
                temperature: CONFIG.temperature,
                max_tokens: CONFIG.maxTokens,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: "You are a strict JSON generator for sales intelligence. Never return text outside JSON.",
                    },
                    { role: "user", content: prompt },
                ],
            });
            const content = response.choices[0]?.message?.content;
            const tokensUsed = response.usage?.total_tokens ?? 0;
            if (!content) {
                return { prediction: null, tokensUsed };
            }
            const parsed = safeJSONParse(content);
            if (!parsed) {
                dbLogger.warn(`AI prediction returned unparseable content (attempt ${attempt + 1})`);
                // Don't retry parse failures — the model is being non-deterministic
                return { prediction: null, tokensUsed };
            }
            const validated = validateAIResponse(parsed);
            return { prediction: validated, tokensUsed };
        }
        catch (error) {
            lastError = error;
            const errMsg = error instanceof Error ? error.message : String(error);
            // Determine if retryable
            const isRetryable = errMsg.includes("timeout") ||
                errMsg.includes("rate limit") ||
                errMsg.includes("503") ||
                errMsg.includes("502") ||
                errMsg.includes("ECONNRESET") ||
                errMsg.includes("ETIMEDOUT");
            if (!isRetryable || attempt === CONFIG.maxRetries) {
                throw error;
            }
            // Exponential backoff with jitter
            const backoff = Math.min(CONFIG.initialBackoffMs * Math.pow(2, attempt), CONFIG.maxBackoffMs);
            const jitter = Math.floor(Math.random() * 200);
            await sleep(backoff + jitter);
            dbLogger.warn(`AI prediction retry ${attempt + 1}/${CONFIG.maxRetries} after ${backoff}ms: ${errMsg}`);
        }
    }
    throw lastError;
}
/* =====================================================
   PUBLIC API — runAIPrediction
===================================================== */
/**
 * Generate an AI-driven prediction for a lead.
 *
 * Behavior:
 * - Returns a cached result if input hasn't changed in last 5 min
 * - Falls back to heuristic if AI is unavailable, fails, or circuit broke
 * - Returns null only if EVERYTHING fails (very rare)
 */
export async function runAIPrediction(input) {
    const result = await predictWithMeta(input);
    return result.prediction;
}
/**
 * Same as runAIPrediction but returns metadata (latency, source, tokens).
 * Use this if you want to log/track AI usage in your analytics.
 */
export async function predictWithMeta(input) {
    const startedAt = Date.now();
    /* ── 1. Cache hit ── */
    if (CONFIG.cacheEnabled) {
        const cached = cache.get(input);
        if (cached) {
            return {
                prediction: cached,
                source: "cache",
                latencyMs: Date.now() - startedAt,
                cached: true,
            };
        }
    }
    /* ── 2. Circuit breaker check ── */
    if (circuitBreaker.isOpen()) {
        return {
            prediction: heuristicFallback(input),
            source: "circuit_breaker",
            latencyMs: Date.now() - startedAt,
        };
    }
    /* ── 3. AI not configured → fallback ── */
    const client = getOpenAIClient();
    if (!client) {
        return {
            prediction: heuristicFallback(input),
            source: "fallback",
            latencyMs: Date.now() - startedAt,
        };
    }
    /* ── 4. Call OpenAI ── */
    try {
        const { prediction, tokensUsed } = await callOpenAIWithRetry(client, input);
        if (!prediction) {
            circuitBreaker.recordFailure();
            return {
                prediction: heuristicFallback(input),
                source: "fallback",
                latencyMs: Date.now() - startedAt,
                tokensUsed,
            };
        }
        circuitBreaker.recordSuccess();
        if (CONFIG.cacheEnabled) {
            cache.set(input, prediction);
        }
        return {
            prediction,
            source: "ai",
            latencyMs: Date.now() - startedAt,
            tokensUsed,
        };
    }
    catch (error) {
        circuitBreaker.recordFailure();
        const errMsg = error instanceof Error ? error.message : String(error);
        dbLogger.error(`AI prediction failed for stage=${input.stage} score=${input.leadScore}: ${errMsg}`);
        return {
            prediction: heuristicFallback(input),
            source: "fallback",
            latencyMs: Date.now() - startedAt,
        };
    }
}
/* =====================================================
   EXPORTS — for testing & monitoring
===================================================== */
export const aiPredictorInternals = {
    clearCache: () => cache.clear(),
    cacheSize: () => cache.size(),
    resetCircuit: () => circuitBreaker.reset(),
    isCircuitOpen: () => circuitBreaker.isOpen(),
    heuristicFallback,
};
//# sourceMappingURL=ai.engine.js.map