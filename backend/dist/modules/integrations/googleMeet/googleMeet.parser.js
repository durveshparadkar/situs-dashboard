class GoogleMeetParser {
    detectEngagement(attendeesCount) {
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
//# sourceMappingURL=googleMeet.parser.js.map