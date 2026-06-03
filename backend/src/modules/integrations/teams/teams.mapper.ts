import teamsParser from "./teams.parser.js";

import {
  TeamsMessage,
  UnifiedConversation,
} from "./teams.types.js";

class TeamsMapper {
  mapMessage(
    message: TeamsMessage
  ): UnifiedConversation {
    return {
      externalId: message.id,

      source: "teams",

      participants:
        message.from?.user?.displayName
          ? [message.from.user.displayName]
          : [],

      snippet: message.body?.content ?? "",

      sentiment:
        teamsParser.detectSentiment(
          message.body?.content ?? ""
        ),

      ...(message.createdDateTime && {
        occurredAt: new Date(message.createdDateTime),
      }),
    };
  }

  mapMessages(
    messages: TeamsMessage[]
  ): UnifiedConversation[] {
    return messages.map((message) =>
      this.mapMessage(message)
    );
  }
}

export default new TeamsMapper();