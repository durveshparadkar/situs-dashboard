import slackConnector from "./slack.connector.js";

import slackMapper from "./slack.mapper.js";

class SlackSyncService {
  /* =====================================================
     SYNC
  ===================================================== */

  async syncMessages(
    accessToken: string
  ) {
    slackConnector.initialize(
      accessToken
    );

    const channels =
      await slackConnector.fetchChannels();

    const allMessages = [];

    for (const channel of channels) {
      const messages =
        await slackConnector.fetchMessages(
          channel.id
        );

      allMessages.push(...messages);
    }

    const conversations =
      slackMapper.mapMessages(
        allMessages as any
      );

    return {
      synced: conversations.length,

      conversations,
    };
  }
}

export default new SlackSyncService();