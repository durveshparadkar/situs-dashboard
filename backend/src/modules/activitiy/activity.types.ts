export type ActivityType =
  | "email"
  | "slack"
  | "meeting"
  | "risk"
  | "opportunity";

export type ActivitySeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface UnifiedActivity {
  externalId: string;

  organizationId: string;

  provider:
    | "salesforce"
    | "hubspot"
    | "gmail"
    | "slack"
    | "zoom"
    | "calendar"
    | "teams"
    | "outlook"
    | "zoho"
    | "pipedrive"
    | "googleMeet";

  type: ActivityType;

  severity?: ActivitySeverity;

  title: string;

  description: string;

  sentiment?:
    | "positive"
    | "neutral"
    | "negative";

  metadata?: Record<
    string,
    unknown
  >;

  occurredAt: Date;
}