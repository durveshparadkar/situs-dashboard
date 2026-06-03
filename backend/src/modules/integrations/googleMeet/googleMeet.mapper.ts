import googleMeetParser from "./googleMeet.parser.js";

import {
  GoogleMeetEvent,
  UnifiedMeeting,
} from "./googleMeet.types.js";

class GoogleMeetMapper {
  mapMeeting(
    event: GoogleMeetEvent
  ): UnifiedMeeting {
    const attendees =
      event.attendees?.map(
        (attendee) => attendee.email || ""
      ) || [];

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

      source: "googleMeet",

      title: event.summary ?? "",

      attendees,

      engagementLevel:
        googleMeetParser.detectEngagement(
          attendees.length
        ),

      ...(event.conferenceData?.conferenceId && {
        meetingId: event.conferenceData.conferenceId,
      }),

      ...(startTime && { startTime }),
      ...(endTime && { endTime }),
    };
  }

  mapMeetings(
    events: GoogleMeetEvent[]
  ): UnifiedMeeting[] {
    return events.map((event) =>
      this.mapMeeting(event)
    );
  }
}

export default new GoogleMeetMapper();