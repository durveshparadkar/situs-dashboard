import gmailParser from "./gmail.parser.js";

import {
  GmailMessage,
  UnifiedConversation,
} from "./gmail.types.js";

class GmailMapper {
  mapMessage(
    message: GmailMessage
  ): UnifiedConversation {
    const headers =
      message.payload?.headers || [];

    const subject =
      headers.find(
        (h) => h.name === "Subject"
      )?.value || "";

    const from =
      headers.find(
        (h) => h.name === "From"
      )?.value || "";

    return {
      externalId: message.id,

      source: "gmail",

      subject,

      participants: [from],

      snippet: message.snippet ?? "",

      sentiment:
        gmailParser.detectSentiment(
          message.snippet ?? ""
        ),

      ...(message.internalDate && {
        occurredAt: new Date(Number(message.internalDate)),
      }),
    };
  }

  mapMessages(
    messages: GmailMessage[]
  ): UnifiedConversation[] {
    return messages.map((message) =>
      this.mapMessage(message)
    );
  }
}

export default new GmailMapper();