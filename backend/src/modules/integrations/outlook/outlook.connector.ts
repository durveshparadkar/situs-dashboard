import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  OutlookMessage,
  OutlookMessagesResponse,
} from "./outlook.types.js";

class OutlookConnector {
  private client: AxiosInstance | null =
    null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL:
        "https://graph.microsoft.com/v1.0",
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
        "Outlook client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     FETCH MESSAGES
  ===================================================== */

  async fetchMessages() {
    try {
      const client = this.getClient();

      const response =
        await client.get<OutlookMessagesResponse>(
          "/me/messages",
          {
            params: {
              $top: 50,
            },
          }
        );

      return response.data.value || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.error
          ?.message ||
          "Failed to fetch Outlook messages"
      );
    }
  }
}

export default new OutlookConnector();