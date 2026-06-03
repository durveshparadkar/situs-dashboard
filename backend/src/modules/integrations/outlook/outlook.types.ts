export interface OutlookMessage {
  id: string;

  subject?: string;

  bodyPreview?: string;

  from?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };

  receivedDateTime?: string;
}

export interface OutlookMessagesResponse {
  value?: OutlookMessage[];
}

export interface UnifiedConversation {
  externalId: string;

  source: "outlook";

  subject?: string;

  participants?: string[];

  snippet?: string;

  sentiment?: "positive" | "neutral" | "negative";

  occurredAt?: Date;
}