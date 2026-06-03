import teamsParser from "./teams.parser.js";
class TeamsMapper {
    mapMessage(message) {
        return {
            externalId: message.id,
            source: "teams",
            participants: message.from?.user?.displayName
                ? [message.from.user.displayName]
                : [],
            snippet: message.body?.content ?? "",
            sentiment: teamsParser.detectSentiment(message.body?.content ?? ""),
            ...(message.createdDateTime && {
                occurredAt: new Date(message.createdDateTime),
            }),
        };
    }
    mapMessages(messages) {
        return messages.map((message) => this.mapMessage(message));
    }
}
export default new TeamsMapper();
//# sourceMappingURL=teams.mapper.js.map