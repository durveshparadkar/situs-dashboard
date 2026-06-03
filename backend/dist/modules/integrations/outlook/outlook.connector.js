import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class OutlookConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(accessToken) {
        this.client = axios.create({
            baseURL: "https://graph.microsoft.com/v1.0",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            timeout: 30000,
        });
    }
    /* =====================================================
       CLIENT
    ===================================================== */
    getClient() {
        if (!this.client) {
            throw ApiError.internal("Outlook client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH MESSAGES
    ===================================================== */
    async fetchMessages() {
        try {
            const client = this.getClient();
            const response = await client.get("/me/messages", {
                params: {
                    $top: 50,
                },
            });
            return response.data.value || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.error
                ?.message ||
                "Failed to fetch Outlook messages");
        }
    }
}
export default new OutlookConnector();
//# sourceMappingURL=outlook.connector.js.map