import salesforceConnector from "./salesforce.connector.js";
import salesforceMapper from "./salesforce.mapper.js";
class SalesforceSyncService {
    /* =====================================================
       SYNC LEADS
    ===================================================== */
    async syncLeads(instanceUrl, accessToken) {
        /* ================= INIT ================= */
        salesforceConnector.initialize(instanceUrl, accessToken);
        /* ================= FETCH ================= */
        const salesforceLeads = await salesforceConnector.fetchLeads();
        /* ================= MAP ================= */
        const unifiedLeads = salesforceMapper.mapLeads(salesforceLeads);
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
export default new SalesforceSyncService();
//# sourceMappingURL=salesforce.sync.service.js.map