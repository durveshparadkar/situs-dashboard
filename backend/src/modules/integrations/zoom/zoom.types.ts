export interface ZoomMeeting {
  id: number;

  uuid?: string;

  topic?: string;

  start_time?: string;

  duration?: number;

  participants_count?: number;
}

export interface ZoomMeetingsResponse {
  meetings?: ZoomMeeting[];
}

export interface UnifiedMeeting {
  externalId: string;

  source: "zoom";

  title?: string;

  attendeesCount?: number;

  engagementLevel?:
    | "high"
    | "medium"
    | "low";

  startTime?: Date;

  durationMinutes?: number;
}