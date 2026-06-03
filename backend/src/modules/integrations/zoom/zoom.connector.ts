import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  ZoomMeeting,
  ZoomMeetingsResponse,
} from "./zoom.types.js";

class ZoomConnector {
  private client: AxiosInstance | null =
    null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL: "https://api.zoom.us/v2",
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
        "Zoom client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     FETCH MEETINGS
  ===================================================== */

  async fetchMeetings() {
    try {
      const client = this.getClient();

      const response =
        await client.get<ZoomMeetingsResponse>(
          "/users/me/meetings",
          {
            params: {
              page_size: 100,
            },
          }
        );

      return response.data.meetings || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.message ||
          "Failed to fetch Zoom meetings"
      );
    }
  }
}

export default new ZoomConnector();