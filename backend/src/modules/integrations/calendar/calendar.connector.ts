import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  CalendarEvent,
  CalendarEventsResponse,
} from "./calendar.types.js";

class CalendarConnector {
  private client: AxiosInstance | null =
    null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL:
        "https://www.googleapis.com/calendar/v3",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30000,
    });
  }

  /* =====================================================
     CLIENT
  ===================================================== */

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw ApiError.internal(
        "Calendar client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     FETCH EVENTS
  ===================================================== */

  async fetchEvents() {
    try {
      const client = this.getClient();

      const response =
        await client.get<CalendarEventsResponse>(
          "/calendars/primary/events",
          {
            params: {
              maxResults: 100,
              singleEvents: true,
              orderBy: "startTime",
            },
          }
        );

      return response.data.items || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.error
          ?.message ||
          "Failed to fetch calendar events"
      );
    }
  }
}

export default new CalendarConnector();