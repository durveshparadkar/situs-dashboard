/* =====================================================
   SALESFORCE
===================================================== */
export function mapSalesforceActivity(payload, organizationId) {
    return {
        externalId: String(payload.id),
        organizationId,
        provider: "salesforce",
        type: payload.riskScore > 70
            ? "risk"
            : "opportunity",
        severity: payload.riskScore > 85
            ? "critical"
            : payload.riskScore > 70
                ? "high"
                : "medium",
        title: payload.name ||
            "Salesforce Update",
        description: payload.description ||
            "Pipeline intelligence update",
        metadata: {
            stage: payload.stage,
            amount: payload.amount,
            riskScore: payload.riskScore,
        },
        occurredAt: payload.updatedAt
            ? new Date(payload.updatedAt)
            : new Date(),
    };
}
/* =====================================================
   HUBSPOT
===================================================== */
export function mapHubspotActivity(payload, organizationId) {
    return {
        externalId: String(payload.id),
        organizationId,
        provider: "hubspot",
        type: payload.priority ===
            "high"
            ? "risk"
            : "opportunity",
        severity: payload.priority ===
            "high"
            ? "high"
            : "medium",
        title: payload.subject ||
            "HubSpot Activity",
        description: payload.description ||
            "CRM engagement update",
        metadata: {
            contact: payload.contact,
            dealStage: payload.stage,
        },
        occurredAt: payload.updatedAt
            ? new Date(payload.updatedAt)
            : new Date(),
    };
}
/* =====================================================
   GMAIL
===================================================== */
export function mapGmailActivity(payload, organizationId) {
    const sentiment = payload.sentiment ||
        "neutral";
    return {
        externalId: String(payload.id),
        organizationId,
        provider: "gmail",
        type: sentiment ===
            "negative"
            ? "risk"
            : "email",
        severity: sentiment ===
            "negative"
            ? "high"
            : "medium",
        title: payload.subject ||
            "Email Activity",
        description: payload.preview ||
            "Customer email received",
        sentiment,
        metadata: {
            from: payload.from,
            threadId: payload.threadId,
        },
        occurredAt: payload.timestamp
            ? new Date(payload.timestamp)
            : new Date(),
    };
}
/* =====================================================
   SLACK
===================================================== */
export function mapSlackActivity(payload, organizationId) {
    const sentiment = payload.sentiment ||
        "neutral";
    return {
        externalId: String(payload.ts),
        organizationId,
        provider: "slack",
        type: sentiment ===
            "negative"
            ? "risk"
            : "slack",
        severity: sentiment ===
            "negative"
            ? "high"
            : "medium",
        title: "Slack Conversation",
        description: payload.text ||
            "Slack activity detected",
        sentiment,
        metadata: {
            channel: payload.channel,
            user: payload.user,
        },
        occurredAt: payload.ts
            ? new Date(Number(payload.ts) *
                1000)
            : new Date(),
    };
}
/* =====================================================
   ZOOM
===================================================== */
export function mapZoomActivity(payload, organizationId) {
    return {
        externalId: String(payload.uuid),
        organizationId,
        provider: "zoom",
        type: "meeting",
        severity: "medium",
        title: payload.topic ||
            "Zoom Meeting",
        description: "Meeting intelligence captured",
        metadata: {
            duration: payload.duration,
            participants: payload.participants,
        },
        occurredAt: payload.start_time
            ? new Date(payload.start_time)
            : new Date(),
    };
}
//# sourceMappingURL=activity.mapper.js.map