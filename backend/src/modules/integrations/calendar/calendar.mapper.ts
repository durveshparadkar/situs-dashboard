import calendarParser from "./calendar.parser.js";

import {
  CalendarEvent,
  UnifiedMeeting,
} from "./calendar.types.js";

class CalendarMapper {
  mapEvent(
    event: CalendarEvent
  ): UnifiedMeeting {
    const startTime =
      event.start?.dateTime
        ? new Date(event.start.dateTime)
        : undefined;

    const endTime =
      event.end?.dateTime
        ? new Date(event.end.dateTime)
        : undefined;

    return {
      externalId: event.id,

      source: "calendar",

      title: event.summary ?? "",

      attendees:
        event.attendees?.map(
          (attendee) => attendee.email || ""
        ) || [],

      cadenceRisk:
        calendarParser.detectCadenceRisk(startTime),

      ...(startTime && { startTime }),
      ...(endTime && { endTime }),
    };
  }

  mapEvents(
    events: CalendarEvent[]
  ): UnifiedMeeting[] {
    return events.map((event) =>
      this.mapEvent(event)
    );
  }
}

export default new CalendarMapper();