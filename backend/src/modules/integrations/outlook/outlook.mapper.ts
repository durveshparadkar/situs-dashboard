import outlookParser from "./outlook.parser.js";

import {
  OutlookMessage,
  UnifiedConversation,
} from "./outlook.types.js";

class OutlookMapper {
  mapMessage(
    message: OutlookMessage
  ): UnifiedConversation {
    return {
      externalId: message.id,

      source: "outlook",

      ...(message.subject !== undefined && {
        subject: message.subject,
      }),

      participants:
        message.from?.emailAddress?.address
          ? [message.from.emailAddress.address]
          : [],

      snippet: message.bodyPreview ?? "",

      sentiment:
        outlookParser.detectSentiment(
          message.bodyPreview ?? ""
        ),

      ...(message.receivedDateTime && {
        occurredAt: new Date(message.receivedDateTime),
      }),
    };
  }

  mapMessages(
    messages: OutlookMessage[]
  ): UnifiedConversation[] {
    return messages.map((message) =>
      this.mapMessage(message)
    );
  }
}

export default new OutlookMapper();