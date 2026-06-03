import teamsConnector from "./teams.connector.js";

import teamsMapper from "./teams.mapper.js";

class TeamsSyncService {
  /* =====================================================
     SYNC
  ===================================================== */

  async syncMessages(
    accessToken: string
  ) {
    teamsConnector.initialize(
      accessToken
    );

    const messages =
      await teamsConnector.fetchMessages();

    const conversations =
      teamsMapper.mapMessages(
        messages
      );

    return {
      synced: conversations.length,

      conversations,
    };
  }
}

export default new TeamsSyncService();