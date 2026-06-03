class TeamsParser {
    detectSentiment(text) {
        if (!text) {
            return "neutral";
        }
        const normalized = text.toLowerCase();
        const positiveWords = [
            "great",
            "approved",
            "good",
            "closed",
            "resolved",
        ];
        const negativeWords = [
            "blocked",
            "issue",
            "problem",
            "delay",
            "risk",
        ];
        if (positiveWords.some((word) => normalized.includes(word))) {
            return "positive";
        }
        if (negativeWords.some((word) => normalized.includes(word))) {
            return "negative";
        }
        return "neutral";
    }
}
export default new TeamsParser();
//# sourceMappingURL=teams.parser.js.map