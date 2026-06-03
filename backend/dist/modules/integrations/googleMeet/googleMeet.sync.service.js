import googleMeetConnector from "./googleMeet.connector.js";
import googleMeetMapper from "./googleMeet.mapper.js";
class GoogleMeetSyncService {
    /* =====================================================
       SYNC MEETINGS
    ===================================================== */
    async syncMeetings(accessToken) {
        googleMeetConnector.initialize(accessToken);
        const meetings = await googleMeetConnector.fetchMeetings();
        const unifiedMeetings = googleMeetMapper.mapMeetings(meetings);
        return {
            synced: unifiedMeetings.length,
            meetings: unifiedMeetings,
        };
    }
}
export default new GoogleMeetSyncService();
//# sourceMappingURL=googleMeet.sync.service.js.map