export interface GoogleMeetEvent {
  id: string;

  summary?: string;

  description?: string;

  start?: {
    dateTime?: string;
  };

  end?: {
    dateTime?: string;
  };

  attendees?: {
    email?: string;
  }[];

  conferenceData?: {
    conferenceId?: string;
  };
}

export interface GoogleMeetEventsResponse {
  items?: GoogleMeetEvent[];
}

export interface UnifiedMeeting {
  externalId: string;

  source: "googleMeet";

  title?: string;

  attendees?: string[];

  meetingId?: string;

  startTime?: Date;

  endTime?: Date;

  engagementLevel?:
    | "high"
    | "medium"
    | "low";
}