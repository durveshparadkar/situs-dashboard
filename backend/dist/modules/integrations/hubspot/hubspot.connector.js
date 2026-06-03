import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class HubspotConnector {
    client = null;
    /* =====================================================
       INITIALIZE
    ===================================================== */
    initialize(accessToken) {
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
    getClient() {
        if (!this.client) {
            throw ApiError.internal("HubSpot client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH CONTACTS
    ===================================================== */
    async fetchLeads() {
        try {
            const client = this.getClient();
            const response = await client.get("/crm/v3/objects/contacts", {
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
            });
            return response.data.results;
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.message ||
                "Failed to fetch HubSpot contacts");
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
        }
        catch {
            return {
                connected: false,
            };
        }
    }
}
export default new HubspotConnector();
//# sourceMappingURL=hubspot.connector.js.map