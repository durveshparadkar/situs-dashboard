import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class CalendarConnector {
    client = null;
    /* =====================================================
       INIT
    ===================================================== */
    initialize(accessToken) {
        this.client = axios.create({
            baseURL: "https://www.googleapis.com/calendar/v3",
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
            throw ApiError.internal("Calendar client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH EVENTS
    ===================================================== */
    async fetchEvents() {
        try {
            const client = this.getClient();
            const response = await client.get("/calendars/primary/events", {
                params: {
                    maxResults: 100,
                    singleEvents: true,
                    orderBy: "startTime",
                },
            });
            return response.data.items || [];
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.error
                ?.message ||
                "Failed to fetch calendar events");
        }
    }
}
export default new CalendarConnector();
//# sourceMappingURL=calendar.connector.js.map