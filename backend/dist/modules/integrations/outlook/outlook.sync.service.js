import outlookConnector from "./outlook.connector.js";
import outlookMapper from "./outlook.mapper.js";
class OutlookSyncService {
    /* =====================================================
       SYNC
    ===================================================== */
    async syncMessages(accessToken) {
        outlookConnector.initialize(accessToken);
        const messages = await outlookConnector.fetchMessages();
        const conversations = outlookMapper.mapMessages(messages);
        return {
            synced: conversations.length,
            conversations,
        };
    }
}
export default new OutlookSyncService();
//# sourceMappingURL=outlook.sync.service.js.map