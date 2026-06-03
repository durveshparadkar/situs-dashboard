import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class ZoomConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(accessToken) {
        this.client = axios.create({
            baseURL: "https://api.zoom.us/v2",
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
            throw ApiError.internal("Zoom client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH MEETINGS
    ===================================================== */
    async fetchMeetings() {
        try {
            const client = this.getClient();
            const response = await client.get("/users/me/meetings", {
                params: {
                    page_size: 100,
                },
            });
            return response.data.meetings || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.message ||
                "Failed to fetch Zoom meetings");
        }
    }
}
export default new ZoomConnector();
//# sourceMappingURL=zoom.connector.js.map