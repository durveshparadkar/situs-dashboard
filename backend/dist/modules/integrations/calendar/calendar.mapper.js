import calendarParser from "./calendar.parser.js";
class CalendarMapper {
    mapEvent(event) {
        const startTime = event.start?.dateTime
            ? new Date(event.start.dateTime)
            : undefined;
        const endTime = event.end?.dateTime
            ? new Date(event.end.dateTime)
            : undefined;
        return {
            externalId: event.id,
            source: "calendar",
            title: event.summary ?? "",
            attendees: event.attendees?.map((attendee) => attendee.email || "") || [],
            cadenceRisk: calendarParser.detectCadenceRisk(startTime),
            ...(startTime && { startTime }),
            ...(endTime && { endTime }),
        };
    }
    mapEvents(events) {
        return events.map((event) => this.mapEvent(event));
    }
}
export default new CalendarMapper();
//# sourceMappingURL=calendar.mapper.js.map