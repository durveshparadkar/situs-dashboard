class ZoomParser {
  detectEngagement(
    participantsCount?: number,
    duration?: number
  ): "high" | "medium" | "low" {
    if (
      (participantsCount || 0) >= 5 &&
      (duration || 0) >= 45
    ) {
      return "high";
    }

    if (
      (participantsCount || 0) >= 2 &&
      (duration || 0) >= 20
    ) {
      return "medium";
    }

    return "low";
  }
}

export default new ZoomParser();