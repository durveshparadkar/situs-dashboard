class CalendarParser {
  detectCadenceRisk(
    lastMeetingDate?: Date
  ): "healthy" | "warning" | "critical" {
    if (!lastMeetingDate) {
      return "critical";
    }

    const now = new Date();

    const diffMs =
      now.getTime() -
      lastMeetingDate.getTime();

    const diffDays =
      diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 7) {
      return "healthy";
    }

    if (diffDays <= 14) {
      return "warning";
    }

    return "critical";
  }
}

export default new CalendarParser();