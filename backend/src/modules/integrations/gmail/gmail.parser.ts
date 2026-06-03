class GmailParser {
  /* =====================================================
     SIMPLE SENTIMENT DETECTION
  ===================================================== */

  detectSentiment(
    text?: string
  ): "positive" | "neutral" | "negative" {
    if (!text) return "neutral";

    const normalized = text.toLowerCase();

    const positiveWords = [
      "great",
      "interested",
      "approved",
      "good",
      "yes",
    ];

    const negativeWords = [
      "not interested",
      "cancel",
      "bad",
      "issue",
      "problem",
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

export default new GmailParser();