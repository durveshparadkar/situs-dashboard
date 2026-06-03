import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class ZohoConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(accessToken) {
        this.client = axios.create({
            baseURL: "https://www.zohoapis.com/crm/v2",
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`,
            },
            timeout: 30000,
        });
    }
    /* =====================================================
       CLIENT
    ===================================================== */
    getClient() {
        if (!this.client) {
            throw ApiError.internal("Zoho client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH LEADS
    ===================================================== */
    async fetchLeads() {
        try {
            const client = this.getClient();
            const response = await client.get("/Leads");
            return response.data.data || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.message ||
                "Failed to fetch Zoho leads");
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
        }
        catch {
            return {
                connected: false,
            };
        }
    }
}
export default new ZohoConnector();
//# sourceMappingURL=zoho.connector.js.map