import outlookParser from "./outlook.parser.js";
class OutlookMapper {
    mapMessage(message) {
        return {
            externalId: message.id,
            source: "outlook",
            ...(message.subject !== undefined && {
                subject: message.subject,
            }),
            participants: message.from?.emailAddress?.address
                ? [message.from.emailAddress.address]
                : [],
            snippet: message.bodyPreview ?? "",
            sentiment: outlookParser.detectSentiment(message.bodyPreview ?? ""),
            ...(message.receivedDateTime && {
                occurredAt: new Date(message.receivedDateTime),
            }),
        };
    }
    mapMessages(messages) {
        return messages.map((message) => this.mapMessage(message));
    }
}
export default new OutlookMapper();
//# sourceMappingURL=outlook.mapper.js.map