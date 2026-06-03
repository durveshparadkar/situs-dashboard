// event.bus.ts
//
// In-process event bus for Revenue OS. Decouples producers (controllers,
// services) from consumers (decision engines, notifications, audit log,
// analytics pipelines).
//
// Architecture decisions:
//   - In-process (not Redis pub/sub) — appropriate for single-instance MVP
//   - Async handlers — never block the producer
//   - Failure-isolated — one handler failing never blocks others
//   - Wildcard listeners — subscribe to event patterns
//   - Type-safe — payloads enforced at compile time
//   - Observable — every emission logged with correlation ID
//
// Migration path: when scaling to multi-instance, swap the internal
// emit() to publish to Redis Streams or BullMQ — the public API
// stays the same.
import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const EVENT_BUS_CONFIG = {
    /**
     * Per-handler timeout. A slow handler shouldn't pile up event processing
     * indefinitely. Other handlers still run.
     */
    handlerTimeoutMs: 30_000,
    /**
     * Max handlers per event. Defends against memory leaks from accidentally
     * registering the same handler in a loop.
     */
    maxHandlersPerEvent: 100,
    /**
     * Whether to emit events to underlying EventEmitter for wildcard listeners
     * and external observability tools.
     */
    emitToObservers: true,
    /**
     * Default retry attempts per handler. Each handler can override via
     * registration options.
     */
    defaultRetries: 0,
    /**
     * Delay between retries (ms). Doubles each retry (exponential backoff).
     */
    retryBaseDelayMs: 500,
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Wrap a function with a timeout. If the function doesn't resolve within
 * ms, reject with a timeout error.
 */
function withTimeout(promise, ms, description) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(description + " timed out after " + ms + "ms"));
        }, ms);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ============================================================
// EVENT BUS
// ============================================================
class EventBus {
    handlers = new Map();
    wildcardHandlers = [];
    observers = new EventEmitter();
    constructor() {
        // Increase max listeners on the observer — we may have many internal
        // listeners across decision engines.
        this.observers.setMaxListeners(1000);
    }
    // -----------------------------------------------------------
    // SUBSCRIBE
    // -----------------------------------------------------------
    /**
     * Register a handler for a specific event.
     *
     * Usage:
     *   eventBus.on("LEAD_CREATED", async (payload) => {
     *     await scoreNewLead(payload.leadId);
     *   });
     *
     *   eventBus.on("DEAL_RISK_DETECTED", async (payload) => {
     *     await notifyManager(payload.dealId, payload.riskLevel);
     *   }, { retries: 3, name: "deal-risk-notifier" });
     */
    on(eventName, handler, options = {}) {
        const existing = this.handlers.get(eventName) ?? [];
        if (existing.length >= EVENT_BUS_CONFIG.maxHandlersPerEvent) {
            dbLogger.warn("Event bus rejected handler — too many handlers for event " +
                eventName + " (max " + EVENT_BUS_CONFIG.maxHandlersPerEvent + ")");
            return () => { };
        }
        const registered = {
            handler: handler,
            options,
            callCount: 0,
            id: randomUUID(),
        };
        existing.push(registered);
        this.handlers.set(eventName, existing);
        // Return unsubscribe function
        return () => {
            const current = this.handlers.get(eventName);
            if (!current)
                return;
            const filtered = current.filter((h) => h.id !== registered.id);
            if (filtered.length === 0) {
                this.handlers.delete(eventName);
            }
            else {
                this.handlers.set(eventName, filtered);
            }
        };
    }
    /**
     * Register a one-time handler — auto-removed after first execution.
     */
    once(eventName, handler, options = {}) {
        return this.on(eventName, handler, { ...options, maxCalls: 1 });
    }
    /**
     * Subscribe to ALL events. Useful for audit log, debugging, or
     * external observability sinks.
     *
     * Usage:
     *   eventBus.onAny(async (eventName, payload) => {
     *     await auditLogger.log({ event: eventName, payload });
     *   });
     */
    onAny(handler) {
        this.wildcardHandlers.push(handler);
        return () => {
            this.wildcardHandlers = this.wildcardHandlers.filter((h) => h !== handler);
        };
    }
    /**
     * Remove all handlers for an event (or all events if no name given).
     */
    off(eventName) {
        if (eventName) {
            this.handlers.delete(eventName);
        }
        else {
            this.handlers.clear();
            this.wildcardHandlers = [];
        }
    }
    // -----------------------------------------------------------
    // EMIT
    // -----------------------------------------------------------
    /**
     * Emit an event. All registered handlers run in parallel; failures in
     * one handler don't block others.
     *
     * Returns a promise that resolves after ALL handlers complete (success
     * or failure). For fire-and-forget semantics, don't await.
     *
     * Usage:
     *   await eventBus.emit("LEAD_CREATED", {
     *     organizationId: actor.organizationId,
     *     actorId:        actor.userId,
     *     leadId:         newLead._id.toString(),
     *     source:         "WEBSITE",
     *     stage:          "NEW",
     *   });
     */
    async emit(eventName, payload) {
        // Enrich payload with envelope fields if missing
        const enriched = {
            ...payload,
            timestamp: payload.timestamp ?? new Date().toISOString(),
        };
        // Validate required envelope fields
        if (!enriched.organizationId) {
            dbLogger.error("Event emitted without organizationId: " + eventName);
            // Continue anyway — but flag it
        }
        dbLogger.info("Event emitted: " + eventName +
            " org=" + (enriched.organizationId ?? "none") +
            (enriched.requestId ? " requestId=" + enriched.requestId : ""));
        // Notify observers (for external sinks like metrics, OpenTelemetry)
        if (EVENT_BUS_CONFIG.emitToObservers) {
            try {
                this.observers.emit(eventName, enriched);
            }
            catch (err) {
                dbLogger.warn("Observer emit failed for " + eventName + ": " +
                    (err?.message ?? "unknown"));
            }
        }
        // Run registered handlers in parallel
        const registered = this.handlers.get(eventName) ?? [];
        const wildcardPromises = this.wildcardHandlers.map((h) => this.invokeWildcardHandler(h, eventName, enriched));
        const handlerPromises = registered.map((rh) => this.invokeHandler(rh, eventName, enriched));
        // Promise.allSettled — never throws, captures all outcomes
        await Promise.allSettled([...handlerPromises, ...wildcardPromises]);
        // Clean up handlers that hit maxCalls
        this.pruneOneTimeHandlers(eventName);
    }
    /**
     * Fire-and-forget emit — schedules handlers but doesn't await them.
     * Use when the caller absolutely must not wait (e.g. inside a hot
     * request path where every millisecond matters).
     */
    emitAsync(eventName, payload) {
        // void void chain swallows the promise
        void this.emit(eventName, payload).catch((err) => {
            dbLogger.error("Async emit failed for " + eventName + ": " +
                (err?.message ?? "unknown"));
        });
    }
    // -----------------------------------------------------------
    // INTROSPECTION
    // -----------------------------------------------------------
    /**
     * Get count of handlers registered for an event.
     */
    listenerCount(eventName) {
        return this.handlers.get(eventName)?.length ?? 0;
    }
    /**
     * List all events that have at least one registered handler.
     */
    registeredEvents() {
        return Array.from(this.handlers.keys());
    }
    /**
     * Underlying EventEmitter for advanced wildcard / metrics subscriptions.
     */
    getObserver() {
        return this.observers;
    }
    // -----------------------------------------------------------
    // INTERNAL
    // -----------------------------------------------------------
    async invokeHandler(rh, eventName, payload) {
        rh.callCount++;
        const handlerName = rh.options.name ?? rh.handler.name ?? "anonymous";
        const timeoutMs = rh.options.timeoutMs ?? EVENT_BUS_CONFIG.handlerTimeoutMs;
        const retries = rh.options.retries ?? EVENT_BUS_CONFIG.defaultRetries;
        let attempt = 0;
        let lastError = null;
        while (attempt <= retries) {
            try {
                const result = rh.handler(payload);
                if (result instanceof Promise) {
                    await withTimeout(result, timeoutMs, "Handler " + handlerName + " for " + eventName);
                }
                return;
            }
            catch (err) {
                lastError = err;
                attempt++;
                if (attempt <= retries) {
                    const backoff = EVENT_BUS_CONFIG.retryBaseDelayMs * Math.pow(2, attempt - 1);
                    dbLogger.warn("Event handler retry " + attempt + "/" + retries +
                        " for " + eventName + " (" + handlerName + ") " +
                        "after " + backoff + "ms");
                    await delay(backoff);
                }
            }
        }
        // Exhausted retries — log and continue (don't propagate)
        dbLogger.error("Event handler failed permanently: event=" + eventName +
            " handler=" + handlerName +
            " attempts=" + (retries + 1) +
            " error=" + (lastError?.message ?? "unknown"));
    }
    async invokeWildcardHandler(handler, eventName, payload) {
        try {
            const result = handler(eventName, payload);
            if (result instanceof Promise) {
                await withTimeout(result, EVENT_BUS_CONFIG.handlerTimeoutMs, "Wildcard handler for " + eventName);
            }
        }
        catch (err) {
            dbLogger.error("Wildcard handler failed: event=" + eventName +
                " error=" + (err?.message ?? "unknown"));
        }
    }
    pruneOneTimeHandlers(eventName) {
        const current = this.handlers.get(eventName);
        if (!current)
            return;
        const remaining = current.filter((rh) => {
            const max = rh.options.maxCalls;
            return max === undefined || rh.callCount < max;
        });
        if (remaining.length === 0) {
            this.handlers.delete(eventName);
        }
        else if (remaining.length !== current.length) {
            this.handlers.set(eventName, remaining);
        }
    }
}
// ============================================================
// SINGLETON EXPORT
// ============================================================
export const eventBus = new EventBus();
export default eventBus;
//# sourceMappingURL=eventBus.js.map