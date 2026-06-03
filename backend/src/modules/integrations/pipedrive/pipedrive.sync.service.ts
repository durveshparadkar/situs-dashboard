import pipedriveConnector from "./pipedrive.connector.js";

import pipedriveMapper from "./pipedrive.mapper.js";

class PipedriveSyncService {
  /* =====================================================
     SYNC LEADS
  ===================================================== */

  async syncLeads(
    apiToken: string
  ) {
    pipedriveConnector.initialize(
      apiToken
    );

    const leads =
      await pipedriveConnector.fetchLeads();

    const unifiedLeads =
      pipedriveMapper.mapLeads(leads);

    return {
      synced: unifiedLeads.length,

      leads: unifiedLeads,
    };
  }
}

export default new PipedriveSyncService();