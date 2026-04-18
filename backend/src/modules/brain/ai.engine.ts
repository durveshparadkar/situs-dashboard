import OpenAI from "openai";
import { BrainDecision } from "./brain.types.js";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000, // 15s safety timeout
    })
  : null;

interface PredictiveInput {
  leadScore: number;
  stage: string;
  stageProbability: number;
  daysSinceLastActivity: number;
  activityCount: number;
  signals: string[];
  dealValue?: number;
}

/* =====================================================
   SAFE JSON PARSER
===================================================== */

function safeJSONParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    // Attempt to extract JSON if wrapped in markdown
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/* =====================================================
   AI PREDICTION ENGINE
===================================================== */

export async function runAIPrediction(
  input: PredictiveInput
): Promise<BrainDecision["aiPrediction"] | null> {
  if (!openai) {
    console.warn("OpenAI API key not configured.");
    return null;
  }

  try {
    const prompt = `
You are a revenue intelligence engine.

Analyze the lead data and return ONLY valid JSON.
Do not include markdown. Do not include explanation outside JSON.

Lead Data:
${JSON.stringify(input)}

Return strictly this format:

{
  "predictedCloseProbability": number,
  "riskLevel": "low" | "medium" | "high",
  "reasoning": "short explanation",
  "nextBestActions": ["action1", "action2"]
}
`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict JSON generator. Never return text outside JSON.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = safeJSONParse(content);
    if (!parsed) return null;

    // Validate & sanitize output
    const probability = Number(parsed.predictedCloseProbability);
    const riskLevel = parsed.riskLevel;

    if (
      isNaN(probability) ||
      !["low", "medium", "high"].includes(riskLevel)
    ) {
      return null;
    }

    return {
      predictedCloseProbability: Math.min(
        Math.max(probability, 0),
        100
      ),
      riskLevel,
      reasoning: String(parsed.reasoning || "").slice(0, 500),
      nextBestActions: Array.isArray(parsed.nextBestActions)
        ? parsed.nextBestActions.slice(0, 5)
        : [],
    };
  } catch (error: any) {
    console.error("AI Prediction Error:", error.message);
    return null;
  }
}