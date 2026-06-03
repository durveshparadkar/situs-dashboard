import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class GmailConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(accessToken) {
        this.client = axios.create({
            baseURL: "https://gmail.googleapis.com/gmail/v1",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            timeout: 30000,
        });
    }
    /* =====================================================
       GET CLIENT
    ===================================================== */
    getClient() {
        if (!this.client) {
            throw ApiError.internal("Gmail client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH EMAILS
    ===================================================== */
    async fetchMessages() {
        try {
            const client = this.getClient();
            const response = await client.get("/users/me/messages", {
                params: {
                    maxResults: 50,
                },
            });
            return response.data.messages || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.error?.message ||
                "Failed to fetch Gmail messages");
        }
    }
    /* =====================================================
       FETCH SINGLE MESSAGE
    ===================================================== */
    async fetchMessage(id) {
        try {
            const client = this.getClient();
            const response = await client.get(`/users/me/messages/${id}`);
            return response.data;
        }
        catch {
            return null;
        }
    }
}
export default new GmailConnector();
//# sourceMappingURL=gmail.connector.js.map