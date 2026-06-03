import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class SlackConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(accessToken) {
        this.client = axios.create({
            baseURL: "https://slack.com/api",
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
            throw ApiError.internal("Slack client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       CHANNELS
    ===================================================== */
    async fetchChannels() {
        try {
            const client = this.getClient();
            const response = await client.get("/conversations.list");
            return response.data.channels || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.error ||
                "Failed to fetch Slack channels");
        }
    }
    /* =====================================================
       MESSAGES
    ===================================================== */
    async fetchMessages(channelId) {
        try {
            const client = this.getClient();
            const response = await client.get("/conversations.history", {
                params: {
                    channel: channelId,
                    limit: 100,
                },
            });
            return response.data.messages || [];
        }
        catch {
            return [];
        }
    }
}
export default new SlackConnector();
//# sourceMappingURL=slack.connector.js.map