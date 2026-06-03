export type IntegrationProvider =
  | "salesforce"
  | "hubspot"
  | "gmail"
  | "outlook"
  | "slack"
  | "zoom"
  | "calendar"
  | "teams"
  | "zoho"
  | "pipedrive"
  | "googleMeet";

export type IntegrationStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR"
  | "SYNCING";

export interface UnifiedLead {
  externalId: string;

  source: IntegrationProvider;

  name: string;

  email?: string;
  phone?: string;
  company?: string;

  status?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface UnifiedDeal {
  externalId: string;

  source: IntegrationProvider;

  name: string;

  amount?: number;

  stage?: string;

  probability?: number;

  closeDate?: Date;
}

export interface UnifiedActivity {
  externalId: string;

  source: IntegrationProvider;

  type:
    | "EMAIL"
    | "CALL"
    | "MEETING"
    | "NOTE"
    | "TASK";

  title?: string;

  description?: string;

  occurredAt?: Date;
}

export interface UnifiedConversation {
  externalId: string;

  source: IntegrationProvider;

  subject?: string;

  participants?: string[];

  sentiment?: "positive" | "neutral" | "negative";

  occurredAt?: Date;
}

export interface UnifiedMeeting {
  externalId: string;

  source: IntegrationProvider;

  title?: string;

  attendees?: string[];

  startTime?: Date;

  endTime?: Date;
}