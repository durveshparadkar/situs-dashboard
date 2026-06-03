import zoomParser from "./zoom.parser.js";
class ZoomMapper {
    mapMeeting(meeting) {
        return {
            externalId: String(meeting.id),
            source: "zoom",
            title: meeting.topic ?? "",
            attendeesCount: meeting.participants_count ?? 0,
            engagementLevel: zoomParser.detectEngagement(meeting.participants_count ?? 0, meeting.duration ?? 0),
            durationMinutes: meeting.duration ?? 0,
            ...(meeting.start_time && {
                startTime: new Date(meeting.start_time),
            }),
        };
    }
    mapMeetings(meetings) {
        return meetings.map((meeting) => this.mapMeeting(meeting));
    }
}
export default new ZoomMapper();
//# sourceMappingURL=zoom.mapper.js.map