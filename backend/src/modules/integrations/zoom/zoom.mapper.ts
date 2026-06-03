import zoomParser from "./zoom.parser.js";

import {
  ZoomMeeting,
  UnifiedMeeting,
} from "./zoom.types.js";

class ZoomMapper {
  mapMeeting(
    meeting: ZoomMeeting
  ): UnifiedMeeting {
    return {
      externalId: String(meeting.id),

      source: "zoom",

      title: meeting.topic ?? "",

      attendeesCount: meeting.participants_count ?? 0,

      engagementLevel:
        zoomParser.detectEngagement(
          meeting.participants_count ?? 0,
          meeting.duration ?? 0
        ),

      durationMinutes: meeting.duration ?? 0,

      ...(meeting.start_time && {
        startTime: new Date(meeting.start_time),
      }),
    };
  }

  mapMeetings(
    meetings: ZoomMeeting[]
  ): UnifiedMeeting[] {
    return meetings.map((meeting) =>
      this.mapMeeting(meeting)
    );
  }
}

export default new ZoomMapper();