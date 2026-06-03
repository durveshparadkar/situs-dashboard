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
} as const;

// ============================================================
// EVENT TAXONOMY — Revenue OS event vocabulary
// ============================================================

/**
 * Common fields included in every event payload via type intersection.
 * Producers populate these; consumers can rely on them being present.
 */
interface EventEnvelope {
  /** Tenant this event belongs to — every event is multi-tenant scoped */
  organizationId: string;

  /** When the event was emitted (ISO timestamp set by the bus) */
  timestamp?:     string;

  /** Request ID from the originating HTTP request (for log correlation) */
  requestId?:     string;

  /** User who triggered the event (if applicable) */
  actorId?:       string;
}

// -------------------- LEAD EVENTS --------------------

export interface LeadCreatedPayload extends EventEnvelope {
  leadId:          string;
  source?:         string;
  stage?:          string;
  assignedTo?:     string;
}

export interface LeadUpdatedPayload extends EventEnvelope {
  leadId:          string;
  changedFields:   string[];
}

export interface LeadStageChangedPayload extends EventEnvelope {
  leadId:          string;
  previousStage:   string;
  newStage:        string;
  dealValue?:      number;
}

export interface LeadAssignedPayload extends EventEnvelope {
  leadId:          string;
  previousOwner?:  string;
  newOwner:        string;
}

export interface LeadEscalatedPayload extends EventEnvelope {
  leadId:          string;
  reason?:         string;
}

export interface LeadEscalationRecommendedPayload extends EventEnvelope {
  leadId:          string;
  reason:          string;
  confidence?:     number;
}

export interface LeadWonPayload extends EventEnvelope {
  leadId:          string;
  dealValue:       number;
  closedAt:        string;
  daysSinceCreated?: number;
}

export interface LeadLostPayload extends EventEnvelope {
  leadId:          string;
  dealValue?:      number;
  lostReason?:     string;
  lostNotes?:      string;
}

// -------------------- DEAL EVENTS --------------------

export interface DealCreatedPayload extends EventEnvelope {
  dealId:          string;
  pipelineId?:     string;
  value?:          number;
  expectedCloseAt?: string;
}

export interface DealStageChangedPayload extends EventEnvelope {
  dealId:          string;
  previousStage:   string;
  newStage:        string;
  pipelineId?:     string;
}

export interface DealRiskDetectedPayload extends EventEnvelope {
  dealId:          string;
  riskLevel:       "low" | "medium" | "high" | "critical";
  riskFactors:     string[];
}

export interface DealForecastChangedPayload extends EventEnvelope {
  dealId:          string;
  previousProbability: number;
  newProbability:  number;
}

// -------------------- USER & TEAM EVENTS --------------------

export interface UserCreatedPayload extends EventEnvelope {
  userId:          string;
  email:           string;
  role?:           string;
}

export interface UserDeactivatedPayload extends EventEnvelope {
  userId:          string;
  reason?:         string;
}

export interface TeamCreatedPayload extends EventEnvelope {
  teamId:          string;
  managerId?:      string;
}

export interface TeamMembershipChangedPayload extends EventEnvelope {
  teamId:          string;
  userId:          string;
  changeType:      "added" | "removed";
}

// -------------------- ORGANIZATION & BILLING EVENTS --------------------

export interface OrganizationCreatedPayload extends EventEnvelope {
  ownerId:         string;
  name?:           string;
}

export interface BillingStateChangedPayload extends EventEnvelope {
  previousStatus?: string;
  newStatus:       string;
  plan?:           string;
}

export interface TrialExpiringPayload extends EventEnvelope {
  daysUntilExpiry: number;
  trialEndsAt:     string;
}

export interface SubscriptionUpgradedPayload extends EventEnvelope {
  previousPlan?:   string;
  newPlan:         string;
}

export interface SubscriptionCanceledPayload extends EventEnvelope {
  plan?:           string;
  reason?:         string;
  immediate:       boolean;
}

// -------------------- INTELLIGENCE & DECISION EVENTS --------------------

export interface InsightGeneratedPayload extends EventEnvelope {
  insightId:       string;
  category:        string;
  severity:        "info" | "warning" | "critical";
  affectedEntityIds?: string[];
}

export interface DecisionRecommendedPayload extends EventEnvelope {
  decisionId:      string;
  decisionType:    string;
  targetEntityId:  string;
  targetEntityType: string;
  urgency:         "low" | "medium" | "high";
}

export interface PipelineLeakDetectedPayload extends EventEnvelope {
  pipelineId:      string;
  stage:           string;
  leakingDealsCount: number;
  estimatedRevenueLoss?: number;
}

// -------------------- INTEGRATION EVENTS --------------------

export interface CrmSyncStartedPayload extends EventEnvelope {
  crmSystem:       string;
  syncType:        "full" | "incremental";
}

export interface CrmSyncCompletedPayload extends EventEnvelope {
  crmSystem:       string;
  recordsImported: number;
  recordsUpdated:  number;
  recordsFailed:   number;
  durationMs:      number;
}

export interface CrmSyncFailedPayload extends EventEnvelope {
  crmSystem:       string;
  errorCode?:      string;
  errorMessage:    string;
}

// -------------------- AUDIT & SECURITY EVENTS --------------------

export interface SecurityAlertPayload extends EventEnvelope {
  alertType:       string;
  severity:        "info" | "warning" | "critical";
  details?:        Record<string, unknown>;
}

export interface PermissionDeniedPayload extends EventEnvelope {
  resource:        string;
  action:          string;
  reason?:         string;
}

// ============================================================
// EVENT MAP
// ============================================================

/**
 * Master event-to-payload mapping. Adding a new event:
 *   1. Define the Payload interface above (extending EventEnvelope)
 *   2. Add the entry here
 *   3. TypeScript enforces correct payload at every emit/on call
 */
export interface Events {
  // Lead lifecycle
  LEAD_CREATED:                  LeadCreatedPayload;
  LEAD_UPDATED:                  LeadUpdatedPayload;
  LEAD_STAGE_CHANGED:            LeadStageChangedPayload;
  LEAD_ASSIGNED:                 LeadAssignedPayload;
  LEAD_WON:                      LeadWonPayload;
  LEAD_LOST:                     LeadLostPayload;
  LEAD_ESCALATED:                LeadEscalatedPayload;
  LEAD_ESCALATION_RECOMMENDED:   LeadEscalationRecommendedPayload;

  // Deal lifecycle
  DEAL_CREATED:                  DealCreatedPayload;
  DEAL_STAGE_CHANGED:            DealStageChangedPayload;
  DEAL_RISK_DETECTED:            DealRiskDetectedPayload;
  DEAL_FORECAST_CHANGED:         DealForecastChangedPayload;

  // User & team
  USER_CREATED:                  UserCreatedPayload;
  USER_DEACTIVATED:              UserDeactivatedPayload;
  TEAM_CREATED:                  TeamCreatedPayload;
  TEAM_MEMBERSHIP_CHANGED:       TeamMembershipChangedPayload;

  // Organization & billing
  ORGANIZATION_CREATED:          OrganizationCreatedPayload;
  BILLING_STATE_CHANGED:         BillingStateChangedPayload;
  TRIAL_EXPIRING:                TrialExpiringPayload;
  SUBSCRIPTION_UPGRADED:         SubscriptionUpgradedPayload;
  SUBSCRIPTION_CANCELED:         SubscriptionCanceledPayload;

  // Decision intelligence
  INSIGHT_GENERATED:             InsightGeneratedPayload;
  DECISION_RECOMMENDED:          DecisionRecommendedPayload;
  PIPELINE_LEAK_DETECTED:        PipelineLeakDetectedPayload;

  // Integrations
  CRM_SYNC_STARTED:              CrmSyncStartedPayload;
  CRM_SYNC_COMPLETED:            CrmSyncCompletedPayload;
  CRM_SYNC_FAILED:               CrmSyncFailedPayload;

  // Audit & security
  SECURITY_ALERT:                SecurityAlertPayload;
  PERMISSION_DENIED:             PermissionDeniedPayload;
}

export type EventName = keyof Events;

// ============================================================
// HANDLER TYPES
// ============================================================

export type EventHandler<K extends EventName> = (
  payload: Events[K]
) => Promise<void> | void;

export type WildcardHandler = (
  eventName: EventName,
  payload:   Events[EventName]
) => Promise<void> | void;

export interface HandlerOptions {
  /**
   * Maximum number of times the handler will execute before being
   * automatically removed. Use for one-time listeners.
   */
  maxCalls?: number;

  /**
   * Number of retries on handler failure. Defaults to 0 (no retries).
   * Each retry uses exponential backoff: 500ms, 1s, 2s, ...
   */
  retries?: number;

  /**
   * Override the default handler timeout for this specific handler.
   */
  timeoutMs?: number;

  /**
   * Optional identifier for logging and unsubscribing by name.
   */
  name?: string;
}

interface RegisteredHandler<K extends EventName> {
  handler:   EventHandler<K>;
  options:   HandlerOptions;
  callCount: number;
  id:        string;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Wrap a function with a timeout. If the function doesn't resolve within
 * ms, reject with a timeout error.
 */
function withTimeout<T>(
  promise:    Promise<T>,
  ms:         number,
  description: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// EVENT BUS
// ============================================================

class EventBus {

  private handlers: Map<EventName, Array<RegisteredHandler<EventName>>> = new Map();
  private wildcardHandlers: WildcardHandler[] = [];
  private observers: EventEmitter = new EventEmitter();

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
  on<K extends EventName>(
    eventName: K,
    handler:   EventHandler<K>,
    options:   HandlerOptions = {}
  ): () => void {
    const existing = this.handlers.get(eventName) ?? [];

    if (existing.length >= EVENT_BUS_CONFIG.maxHandlersPerEvent) {
      dbLogger.warn(
        "Event bus rejected handler — too many handlers for event " +
        eventName + " (max " + EVENT_BUS_CONFIG.maxHandlersPerEvent + ")"
      );
      return () => { /* no-op */ };
    }

    const registered: RegisteredHandler<EventName> = {
      handler:   handler as EventHandler<EventName>,
      options,
      callCount: 0,
      id:        randomUUID(),
    };

    existing.push(registered);
    this.handlers.set(eventName, existing);

    // Return unsubscribe function
    return () => {
      const current = this.handlers.get(eventName);
      if (!current) return;
      const filtered = current.filter((h) => h.id !== registered.id);
      if (filtered.length === 0) {
        this.handlers.delete(eventName);
      } else {
        this.handlers.set(eventName, filtered);
      }
    };
  }

  /**
   * Register a one-time handler — auto-removed after first execution.
   */
  once<K extends EventName>(
    eventName: K,
    handler:   EventHandler<K>,
    options:   HandlerOptions = {}
  ): () => void {
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
  onAny(handler: WildcardHandler): () => void {
    this.wildcardHandlers.push(handler);
    return () => {
      this.wildcardHandlers = this.wildcardHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Remove all handlers for an event (or all events if no name given).
   */
  off<K extends EventName>(eventName?: K): void {
    if (eventName) {
      this.handlers.delete(eventName);
    } else {
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
  async emit<K extends EventName>(
    eventName: K,
    payload:   Events[K]
  ): Promise<void> {
    // Enrich payload with envelope fields if missing
    const enriched: Events[K] = {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    };

    // Validate required envelope fields
    if (!enriched.organizationId) {
      dbLogger.error(
        "Event emitted without organizationId: " + eventName
      );
      // Continue anyway — but flag it
    }

    dbLogger.info(
      "Event emitted: " + eventName +
      " org=" + (enriched.organizationId ?? "none") +
      (enriched.requestId ? " requestId=" + enriched.requestId : "")
    );

    // Notify observers (for external sinks like metrics, OpenTelemetry)
    if (EVENT_BUS_CONFIG.emitToObservers) {
      try {
        this.observers.emit(eventName, enriched);
      } catch (err) {
        dbLogger.warn(
          "Observer emit failed for " + eventName + ": " +
          ((err as Error)?.message ?? "unknown")
        );
      }
    }

    // Run registered handlers in parallel
    const registered = this.handlers.get(eventName) ?? [];
    const wildcardPromises = this.wildcardHandlers.map((h) =>
      this.invokeWildcardHandler(h, eventName, enriched)
    );
    const handlerPromises = registered.map((rh) =>
      this.invokeHandler(rh, eventName, enriched)
    );

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
  emitAsync<K extends EventName>(
    eventName: K,
    payload:   Events[K]
  ): void {
    // void void chain swallows the promise
    void this.emit(eventName, payload).catch((err) => {
      dbLogger.error(
        "Async emit failed for " + eventName + ": " +
        ((err as Error)?.message ?? "unknown")
      );
    });
  }

  // -----------------------------------------------------------
  // INTROSPECTION
  // -----------------------------------------------------------

  /**
   * Get count of handlers registered for an event.
   */
  listenerCount(eventName: EventName): number {
    return this.handlers.get(eventName)?.length ?? 0;
  }

  /**
   * List all events that have at least one registered handler.
   */
  registeredEvents(): EventName[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Underlying EventEmitter for advanced wildcard / metrics subscriptions.
   */
  getObserver(): EventEmitter {
    return this.observers;
  }

  // -----------------------------------------------------------
  // INTERNAL
  // -----------------------------------------------------------

  private async invokeHandler<K extends EventName>(
    rh:        RegisteredHandler<EventName>,
    eventName: K,
    payload:   Events[K]
  ): Promise<void> {
    rh.callCount++;

    const handlerName =
      rh.options.name ?? rh.handler.name ?? "anonymous";
    const timeoutMs =
      rh.options.timeoutMs ?? EVENT_BUS_CONFIG.handlerTimeoutMs;
    const retries =
      rh.options.retries ?? EVENT_BUS_CONFIG.defaultRetries;

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= retries) {
      try {
        const result = rh.handler(payload);
        if (result instanceof Promise) {
          await withTimeout(
            result,
            timeoutMs,
            "Handler " + handlerName + " for " + eventName
          );
        }
        return;
      } catch (err) {
        lastError = err;
        attempt++;

        if (attempt <= retries) {
          const backoff = EVENT_BUS_CONFIG.retryBaseDelayMs * Math.pow(2, attempt - 1);
          dbLogger.warn(
            "Event handler retry " + attempt + "/" + retries +
            " for " + eventName + " (" + handlerName + ") " +
            "after " + backoff + "ms"
          );
          await delay(backoff);
        }
      }
    }

    // Exhausted retries — log and continue (don't propagate)
    dbLogger.error(
      "Event handler failed permanently: event=" + eventName +
      " handler=" + handlerName +
      " attempts=" + (retries + 1) +
      " error=" + ((lastError as Error)?.message ?? "unknown")
    );
  }

  private async invokeWildcardHandler(
    handler:   WildcardHandler,
    eventName: EventName,
    payload:   Events[EventName]
  ): Promise<void> {
    try {
      const result = handler(eventName, payload);
      if (result instanceof Promise) {
        await withTimeout(
          result,
          EVENT_BUS_CONFIG.handlerTimeoutMs,
          "Wildcard handler for " + eventName
        );
      }
    } catch (err) {
      dbLogger.error(
        "Wildcard handler failed: event=" + eventName +
        " error=" + ((err as Error)?.message ?? "unknown")
      );
    }
  }

  private pruneOneTimeHandlers(eventName: EventName): void {
    const current = this.handlers.get(eventName);
    if (!current) return;

    const remaining = current.filter((rh) => {
      const max = rh.options.maxCalls;
      return max === undefined || rh.callCount < max;
    });

    if (remaining.length === 0) {
      this.handlers.delete(eventName);
    } else if (remaining.length !== current.length) {
      this.handlers.set(eventName, remaining);
    }
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const eventBus = new EventBus();

export default eventBus;