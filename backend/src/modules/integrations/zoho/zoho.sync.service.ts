import zohoConnector from "./zoho.connector.js";

import zohoMapper from "./zoho.mapper.js";

class ZohoSyncService {
  /* =====================================================
     SYNC LEADS
  ===================================================== */

  async syncLeads(
    accessToken: string
  ) {
    zohoConnector.initialize(
      accessToken
    );

    const leads =
      await zohoConnector.fetchLeads();

    const unifiedLeads =
      zohoMapper.mapLeads(leads);

    return {
      synced: unifiedLeads.length,

      leads: unifiedLeads,
    };
  }
}

export default new ZohoSyncService();