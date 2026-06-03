export interface GmailMessage {
  id: string;
  threadId: string;

  snippet?: string;

  internalDate?: string;

  payload?: {
    headers?: {
      name: string;
      value: string;
    }[];
  };
}

export interface GmailMessagesResponse {
  messages?: GmailMessage[];
}

export interface UnifiedConversation {
  externalId: string;

  source: "gmail";

  subject?: string;

  participants?: string[];

  snippet?: string;

  sentiment?: "positive" | "neutral" | "negative";

  occurredAt?: Date;
}