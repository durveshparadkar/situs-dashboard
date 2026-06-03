class SlackParser {
    detectSentiment(text) {
        if (!text) {
            return "neutral";
        }
        const normalized = text.toLowerCase();
        const positive = [
            "great",
            "done",
            "approved",
            "good",
            "closed",
        ];
        const negative = [
            "issue",
            "problem",
            "blocked",
            "delay",
            "stuck",
        ];
        if (positive.some((word) => normalized.includes(word))) {
            return "positive";
        }
        if (negative.some((word) => normalized.includes(word))) {
            return "negative";
        }
        return "neutral";
    }
}
export default new SlackParser();
//# sourceMappingURL=slack.parser.js.map