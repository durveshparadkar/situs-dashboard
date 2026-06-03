import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  PipedriveLead,
  PipedriveResponse,
} from "./pipedrive.types.js";

class PipedriveConnector {
  private client: AxiosInstance | null =
    null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(apiToken: string) {
    this.client = axios.create({
      baseURL:
        "https://api.pipedrive.com/v1",
      params: {
        api_token: apiToken,
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
        "Pipedrive client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     FETCH LEADS
  ===================================================== */

  async fetchLeads() {
    try {
      const client = this.getClient();

      const response =
        await client.get<
          PipedriveResponse<PipedriveLead>
        >("/deals");

      return response.data.data || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.error ||
          "Failed to fetch Pipedrive leads"
      );
    }
  }

  /* =====================================================
     HEALTH CHECK
  ===================================================== */

  async testConnection() {
    try {
      const client = this.getClient();

      await client.get("/users/me");

      return {
        connected: true,
      };
    } catch {
      return {
        connected: false,
      };
    }
  }
}

export default new PipedriveConnector();