import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../utils/ApiError.js";

import {
  HubspotLead,
  HubspotResponse,
} from "./hubspot.types.js";

class HubspotConnector {
  private client: AxiosInstance | null = null;

  /* =====================================================
     INITIALIZE
  ===================================================== */

  initialize(accessToken: string) {
    this.client = axios.create({
      baseURL: "https://api.hubapi.com",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
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
        "HubSpot client not initialized"
      );
    }

    return this.client;
  }

  /* =====================================================
     FETCH CONTACTS
  ===================================================== */

  async fetchLeads() {
    try {
      const client = this.getClient();

      const response =
        await client.get<HubspotResponse<HubspotLead>>(
          "/crm/v3/objects/contacts",
          {
            params: {
              limit: 200,
              properties: [
                "firstname",
                "lastname",
                "email",
                "phone",
                "company",
                "lifecyclestage",
                "createdate",
                "lastmodifieddate",
              ].join(","),
            },
          }
        );

      return response.data.results;
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.message ||
          "Failed to fetch HubSpot contacts"
      );
    }
  }

  /* =====================================================
     HEALTH CHECK
  ===================================================== */

  async testConnection() {
    try {
      const client = this.getClient();

      await client.get("/integrations/v1/me");

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

export default new HubspotConnector();