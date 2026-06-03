import googleMeetParser from "./googleMeet.parser.js";
class GoogleMeetMapper {
    mapMeeting(event) {
        const attendees = event.attendees?.map((attendee) => attendee.email || "") || [];
        const startTime = event.start?.dateTime
            ? new Date(event.start.dateTime)
            : undefined;
        const endTime = event.end?.dateTime
            ? new Date(event.end.dateTime)
            : undefined;
        return {
            externalId: event.id,
            source: "googleMeet",
            title: event.summary ?? "",
            attendees,
            engagementLevel: googleMeetParser.detectEngagement(attendees.length),
            ...(event.conferenceData?.conferenceId && {
                meetingId: event.conferenceData.conferenceId,
            }),
            ...(startTime && { startTime }),
            ...(endTime && { endTime }),
        };
    }
    mapMeetings(events) {
        return events.map((event) => this.mapMeeting(event));
    }
}
export default new GoogleMeetMapper();
//# sourceMappingURL=googleMeet.mapper.js.map