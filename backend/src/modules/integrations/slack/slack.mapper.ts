import slackParser from "./slack.parser.js";

import {
  SlackMessage,
  UnifiedConversation,
} from "./slack.types.js";

class SlackMapper {
  mapMessage(
    message: SlackMessage
  ): UnifiedConversation {
    return {
      externalId:
        message.ts || crypto.randomUUID(),

      source: "slack",

      participants: message.user
        ? [message.user]
        : [],

      snippet: message.text ?? "",

      sentiment:
        slackParser.detectSentiment(
          message.text ?? ""
        ),

      ...(message.ts && {
        occurredAt: new Date(Number(message.ts) * 1000),
      }),
    };
  }

  mapMessages(
    messages: SlackMessage[]
  ): UnifiedConversation[] {
    return messages.map((message) =>
      this.mapMessage(message)
    );
  }
}

export default new SlackMapper();