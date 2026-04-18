/* =====================================================
   EVENT TYPES
===================================================== */

type LeadCreatedPayload = {
  organizationId: string;
  userId: string;
  entityId: string; // leadId
};

type LeadStageChangedPayload = {
  organizationId: string;
  leadId: string;
  previousStageId: string;
  newStageId: string;
};

type LeadEscalatedPayload = {
  organizationId: string;
  entityId: string; // leadId
  userId: string;   // manager who approved
};

type LeadEscalationRecommendedPayload = {
  organizationId: string;
  entityId: string; // leadId
};

type Events = {
  LEAD_CREATED: LeadCreatedPayload;
  LEAD_STAGE_CHANGED: LeadStageChangedPayload;

  // 🚨 Escalation System
  LEAD_ESCALATED: LeadEscalatedPayload;
  LEAD_ESCALATION_RECOMMENDED: LeadEscalationRecommendedPayload;
};

/* =====================================================
   EVENT BUS
===================================================== */

class EventBus {
  private handlers: {
    [K in keyof Events]?: Array<
      (payload: Events[K]) => Promise<void>
    >;
  } = {};

  on<K extends keyof Events>(
    eventName: K,
    handler: (payload: Events[K]) => Promise<void>
  ): void {
    if (!this.handlers[eventName]) {
      this.handlers[eventName] = [];
    }

    this.handlers[eventName]!.push(handler);
  }

  async emit<K extends keyof Events>(
    eventName: K,
    payload: Events[K]
  ): Promise<void> {
    console.log("EVENT FIRED:", eventName);

    const eventHandlers = this.handlers[eventName];

    if (!eventHandlers || eventHandlers.length === 0) {
      return;
    }

    for (const handler of eventHandlers) {
      try {
        await handler(payload);
      } catch (error) {
        console.error(
          "Event handler failed for event:",
          eventName,
          error
        );
      }
    }
  }
}

export const eventBus = new EventBus();