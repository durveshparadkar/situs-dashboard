import slackParser from "./slack.parser.js";
class SlackMapper {
    mapMessage(message) {
        return {
            externalId: message.ts || crypto.randomUUID(),
            source: "slack",
            participants: message.user
                ? [message.user]
                : [],
            snippet: message.text ?? "",
            sentiment: slackParser.detectSentiment(message.text ?? ""),
            ...(message.ts && {
                occurredAt: new Date(Number(message.ts) * 1000),
            }),
        };
    }
    mapMessages(messages) {
        return messages.map((message) => this.mapMessage(message));
    }
}
export default new SlackMapper();
//# sourceMappingURL=slack.mapper.js.map