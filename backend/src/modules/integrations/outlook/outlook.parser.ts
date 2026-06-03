class OutlookParser {
  detectSentiment(
    text?: string
  ): "positive" | "neutral" | "negative" {
    if (!text) {
      return "neutral";
    }

    const normalized =
      text.toLowerCase();

    const positiveWords = [
      "great",
      "approved",
      "good",
      "yes",
      "interested",
    ];

    const negativeWords = [
      "problem",
      "issue",
      "declined",
      "cancel",
      "not interested",
    ];

    if (
      positiveWords.some((word) =>
        normalized.includes(word)
      )
    ) {
      return "positive";
    }

    if (
      negativeWords.some((word) =>
        normalized.includes(word)
      )
    ) {
      return "negative";
    }

    return "neutral";
  }
}

export default new OutlookParser();