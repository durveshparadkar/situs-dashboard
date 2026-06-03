import gmailParser from "./gmail.parser.js";
class GmailMapper {
    mapMessage(message) {
        const headers = message.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const from = headers.find((h) => h.name === "From")?.value || "";
        return {
            externalId: message.id,
            source: "gmail",
            subject,
            participants: [from],
            snippet: message.snippet ?? "",
            sentiment: gmailParser.detectSentiment(message.snippet ?? ""),
            ...(message.internalDate && {
                occurredAt: new Date(Number(message.internalDate)),
            }),
        };
    }
    mapMessages(messages) {
        return messages.map((message) => this.mapMessage(message));
    }
}
export default new GmailMapper();
//# sourceMappingURL=gmail.mapper.js.map