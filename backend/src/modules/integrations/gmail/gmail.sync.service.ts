import gmailConnector from "./gmail.connector.js";

import gmailMapper from "./gmail.mapper.js";

class GmailSyncService {
  /* =====================================================
     SYNC EMAILS
  ===================================================== */

  async syncMessages(
    accessToken: string
  ) {
    gmailConnector.initialize(
      accessToken
    );

    const messages =
      await gmailConnector.fetchMessages();

    const detailedMessages =
      await Promise.all(
        messages.map((message) =>
          gmailConnector.fetchMessage(
            message.id
          )
        )
      );

    const validMessages =
      detailedMessages.filter(Boolean);

    const conversations =
      gmailMapper.mapMessages(
        validMessages as any
      );

    return {
      synced: conversations.length,

      conversations,
    };
  }
}

export default new GmailSyncService();