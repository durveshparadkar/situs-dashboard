import axios, { AxiosInstance } from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  GmailMessage,
  GmailMessagesResponse,
} from "./gmail.types.js";

class GmailConnector {
  private client: AxiosInstance | null = null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL:
        "https://gmail.googleapis.com/gmail/v1",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 30000,
    });
  }

  /* =====================================================
     GET CLIENT
  ===================================================== */

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw ApiError.internal(
        "Gmail client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     FETCH EMAILS
  ===================================================== */

  async fetchMessages() {
    try {
      const client = this.getClient();

      const response =
        await client.get<GmailMessagesResponse>(
          "/users/me/messages",
          {
            params: {
              maxResults: 50,
            },
          }
        );

      return response.data.messages || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.error?.message ||
          "Failed to fetch Gmail messages"
      );
    }
  }

  /* =====================================================
     FETCH SINGLE MESSAGE
  ===================================================== */

  async fetchMessage(id: string) {
    try {
      const client = this.getClient();

      const response =
        await client.get<GmailMessage>(
          `/users/me/messages/${id}`
        );

      return response.data;
    } catch {
      return null;
    }
  }
}

export default new GmailConnector();