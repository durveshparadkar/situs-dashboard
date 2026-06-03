import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class PipedriveConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(apiToken) {
        this.client = axios.create({
            baseURL: "https://api.pipedrive.com/v1",
            params: {
                api_token: apiToken,
            },
            timeout: 30000,
        });
    }
    /* =====================================================
       CLIENT
    ===================================================== */
    getClient() {
        if (!this.client) {
            throw ApiError.internal("Pipedrive client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH LEADS
    ===================================================== */
    async fetchLeads() {
        try {
            const client = this.getClient();
            const response = await client.get("/deals");
            return response.data.data || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.error ||
                "Failed to fetch Pipedrive leads");
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
        }
        catch {
            return {
                connected: false,
            };
        }
    }
}
export default new PipedriveConnector();
//# sourceMappingURL=pipedrive.connector.js.map