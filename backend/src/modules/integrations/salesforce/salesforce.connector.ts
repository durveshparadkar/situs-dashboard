import axios, { AxiosInstance } from "axios";
import { ApiError } from "../../../utils/ApiError.js";
import {
  SalesforceAuthResponse,
  SalesforceLead,
  SalesforceQueryResponse,
} from "./salesforce.types.js";

class SalesforceConnector {
  private client: AxiosInstance | null = null;

  /* =====================================================
     INITIALIZE CLIENT
  ===================================================== */

  initialize(instanceUrl: string, accessToken: string) {
    this.client = axios.create({
      baseURL: `${instanceUrl}/services/data/v59.0`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /* =====================================================
     VALIDATE CLIENT
  ===================================================== */

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw ApiError.internal("Salesforce client not initialized");
    }

    return this.client;
  }

  /* =====================================================
     OAUTH TOKEN EXCHANGE
  ===================================================== */

  async exchangeCodeForToken(code: string) {
    try {
      const response = await axios.post<SalesforceAuthResponse>(
        "https://login.salesforce.com/services/oauth2/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: process.env.SALESFORCE_CLIENT_ID || "",
          client_secret:
            process.env.SALESFORCE_CLIENT_SECRET || "",
          redirect_uri:
            process.env.SALESFORCE_REDIRECT_URI || "",
          code,
        }),
        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw ApiError.badRequest(
        error?.response?.data?.error_description ||
          "Failed to authenticate with Salesforce"
      );
    }
  }

  /* =====================================================
     FETCH LEADS
  ===================================================== */

  async fetchLeads() {
    try {
      const client = this.getClient();

      const query = `
        SELECT
          Id,
          Name,
          FirstName,
          LastName,
          Company,
          Email,
          Phone,
          Status,
          CreatedDate,
          LastModifiedDate
        FROM Lead
        ORDER BY LastModifiedDate DESC
        LIMIT 200
      `;

      const response =
        await client.get<SalesforceQueryResponse<SalesforceLead>>(
          `/query`,
          {
            params: {
              q: query,
            },
          }
        );

      return response.data.records;
    } catch (error: any) {
      throw ApiError.internal(
        error?.response?.data?.message ||
          "Failed to fetch Salesforce leads"
      );
    }
  }

  /* =====================================================
     HEALTH CHECK
  ===================================================== */

  async testConnection() {
    try {
      const client = this.getClient();

      await client.get("/limits");

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

export default new SalesforceConnector();