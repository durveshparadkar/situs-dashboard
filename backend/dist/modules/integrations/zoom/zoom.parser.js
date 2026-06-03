class ZoomParser {
    detectEngagement(participantsCount, duration) {
        if ((participantsCount || 0) >= 5 &&
            (duration || 0) >= 45) {
            return "high";
        }
        if ((participantsCount || 0) >= 2 &&
            (duration || 0) >= 20) {
            return "medium";
        }
        return "low";
    }
}
export default new ZoomParser();
//# sourceMappingURL=zoom.parser.js.map