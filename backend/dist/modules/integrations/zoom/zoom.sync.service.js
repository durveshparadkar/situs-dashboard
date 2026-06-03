import zoomConnector from "./zoom.connector.js";
import zoomMapper from "./zoom.mapper.js";
class ZoomSyncService {
    /* =====================================================
       SYNC MEETINGS
    ===================================================== */
    async syncMeetings(accessToken) {
        zoomConnector.initialize(accessToken);
        const meetings = await zoomConnector.fetchMeetings();
        const unifiedMeetings = zoomMapper.mapMeetings(meetings);
        return {
            synced: unifiedMeetings.length,
            meetings: unifiedMeetings,
        };
    }
}
export default new ZoomSyncService();
//# sourceMappingURL=zoom.sync.service.js.map