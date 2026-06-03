import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  TeamsMessage,
  TeamsMessagesResponse,
} from "./teams.types.js";

class TeamsConnector {
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
        "Teams client not initialized"
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
        await client.get<TeamsMessagesResponse>(
          "/me/chats"
        );

      return response.data.value || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.error
          ?.message ||
          "Failed to fetch Teams messages"
      );
    }
  }
}

export default new TeamsConnector();