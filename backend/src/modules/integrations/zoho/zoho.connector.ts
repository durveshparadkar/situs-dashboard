import axios, {
  AxiosInstance,
} from "axios";

import { ApiError } from "../../../utils/ApiError.js";

import {
  ZohoLead,
  ZohoResponse,
} from "./zoho.types.js";

class ZohoConnector {
  private client: AxiosInstance | null =
    null;

  /* =====================================================
     INIT
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL:
        "https://www.zohoapis.com/crm/v2",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
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
        "Zoho client not initialized"
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
          ZohoResponse<ZohoLead>
        >("/Leads");

      return response.data.data || [];
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.message ||
          "Failed to fetch Zoho leads"
      );
    }
  }

  /* =====================================================
     HEALTH CHECK
  ===================================================== */

  async testConnection() {
    try {
      const client = this.getClient();

      await client.get("/org");

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

export default new ZohoConnector();