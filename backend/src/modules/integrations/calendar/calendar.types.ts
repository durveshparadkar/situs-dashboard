export interface CalendarEvent {
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
}

export interface CalendarEventsResponse {
  items?: CalendarEvent[];
}

export interface UnifiedMeeting {
  externalId: string;

  source: "calendar";

  title?: string;

  attendees?: string[];

  startTime?: Date;

  endTime?: Date;

  cadenceRisk?:
    | "healthy"
    | "warning"
    | "critical";
}