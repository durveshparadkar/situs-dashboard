export interface TeamsMessage {
  id: string;

  body?: {
    content?: string;
  };

  from?: {
    user?: {
      displayName?: string;
      id?: string;
    };
  };

  createdDateTime?: string;
}

export interface TeamsMessagesResponse {
  value?: TeamsMessage[];
}

export interface UnifiedConversation {
  externalId: string;

  source: "teams";

  participants?: string[];

  snippet?: string;

  sentiment?: "positive" | "neutral" | "negative";

  occurredAt?: Date;
}