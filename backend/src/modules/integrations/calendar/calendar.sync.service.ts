import calendarConnector from "./calendar.connector.js";

import calendarMapper from "./calendar.mapper.js";

class CalendarSyncService {
  /* =====================================================
     SYNC EVENTS
  ===================================================== */

  async syncEvents(
    accessToken: string
  ) {
    calendarConnector.initialize(
      accessToken
    );

    const events =
      await calendarConnector.fetchEvents();

    const meetings =
      calendarMapper.mapEvents(events);

    return {
      synced: meetings.length,

      meetings,
    };
  }
}

export default new CalendarSyncService();