class GoogleMeetParser {
  detectEngagement(
    attendeesCount?: number
  ): "high" | "medium" | "low" {
    if ((attendeesCount || 0) >= 5) {
      return "high";
    }

    if ((attendeesCount || 0) >= 2) {
      return "medium";
    }

    return "low";
  }
}

export default new GoogleMeetParser();