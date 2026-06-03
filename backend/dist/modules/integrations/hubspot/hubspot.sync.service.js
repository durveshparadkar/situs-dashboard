import hubspotConnector from "./hubspot.connector.js";
import hubspotMapper from "./hubspot.mapper.js";
class HubspotSyncService {
    /* =====================================================
       SYNC LEADS
    ===================================================== */
    async syncLeads(accessToken) {
        /* ================= INIT ================= */
        hubspotConnector.initialize(accessToken);
        /* ================= FETCH ================= */
        const hubspotLeads = await hubspotConnector.fetchLeads();
        /* ================= MAP ================= */
        const unifiedLeads = hubspotMapper.mapLeads(hubspotLeads);
        /* =====================================================
           LATER:
           SAVE INTO DB / EVENT BUS
        ===================================================== */
        return {
            synced: unifiedLeads.length,
            leads: unifiedLeads,
        };
    }
}
export default new HubspotSyncService();
//# sourceMappingURL=hubspot.sync.service.js.map