export interface SlackMessage {
  type?: string;

  user?: string;

  text?: string;

  ts?: string;
}

export interface SlackChannel {
  id: string;

  name: string;
}

export interface SlackConversationResponse {
  messages?: SlackMessage[];
}

export interface SlackChannelsResponse {
  channels?: SlackChannel[];
}

export interface UnifiedConversation {
  externalId: string;

  source: "slack";

  participants?: string[];

  snippet?: string;

  sentiment?: "positive" | "neutral" | "negative";

  occurredAt?: Date;
}