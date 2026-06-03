import axios from "axios";
import { ApiError } from "../../../utils/ApiError.js";
class GoogleMeetConnector {
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
            throw ApiError.internal("Google Meet client not initialized");
        }
        return this.client;
    }
    /* =====================================================
       FETCH EVENTS
    ===================================================== */
    async fetchMeetings() {
        try {
            const client = this.getClient();
            const response = await client.get("/calendars/primary/events", {
                params: {
                    maxResults: 100,
                    singleEvents: true,
                    conferenceDataVersion: 1,
                },
            });
            return (response.data.items?.filter((event) => event.conferenceData
                ?.conferenceId) || []);
        }
        catch (error) {
            throw ApiError.internal(error?.response?.data?.error
                ?.message ||
                "Failed to fetch Google Meet events");
        }
    }
}
export default new GoogleMeetConnector();
//# sourceMappingURL=googleMeet.connector.js.map