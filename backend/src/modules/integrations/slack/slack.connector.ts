import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  SlackChannel,
  SlackChannelsResponse,
  SlackConversationResponse,
} from "./slack.types.js";

class SlackConnector {
  private client: AxiosInstance | null =
    null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL: "https://slack.com/api",
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
        "Slack client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     CHANNELS
  ===================================================== */

  async fetchChannels() {
    try {
      const client = this.getClient();

      const response =
        await client.get<SlackChannelsResponse>(
          "/conversations.list"
        );

      return response.data.channels || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.error ||
          "Failed to fetch Slack channels"
      );
    }
  }

  /* =====================================================
     MESSAGES
  ===================================================== */

  async fetchMessages(
    channelId: string
  ) {
    try {
      const client = this.getClient();

      const response =
        await client.get<SlackConversationResponse>(
          "/conversations.history",
          {
            params: {
              channel: channelId,
              limit: 100,
            },
          }
        );

      return response.data.messages || [];
    } catch {
      return [];
    }
  }
}

export default new SlackConnector();