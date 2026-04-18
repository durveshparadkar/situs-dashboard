import Alert from "./alert.model.js";

class AlertService {
  /* ===============================
     🔥 CREATE ALERT (SMART + DEDUP)
  =============================== */
  async createAlert(data: any) {
    const {
      type,
      severity,
      title,
      message,
      relatedTo,
      organizationId,
    } = data;

    // 🔥 CREATE DEDUP KEY
    const dedupKey = `${type}-${relatedTo.type}-${relatedTo.id}`;

    /* ===============================
       CHECK EXISTING ALERT
    =============================== */
    const existing = await Alert.findOne({
      dedupKey,
      status: "active",
    });

    // 👉 If alert already exists → DO NOTHING (prevents spam)
    if (existing) {
      return existing;
    }

    /* ===============================
       CREATE NEW ALERT
    =============================== */
    return Alert.create({
      type,
      severity,
      title,
      message,
      relatedTo,
      organizationId,
      dedupKey,
      isRead: false,
      status: "active",
    });
  }

  /* ===============================
     GET ALERTS (FILTERED)
  =============================== */
  async getAlerts(orgId: string) {
    return Alert.find({
      organizationId: orgId,
      status: "active",
    }).sort({ createdAt: -1 });
  }

  /* ===============================
     MARK AS READ
  =============================== */
  async markAsRead(alertId: string) {
    return Alert.findByIdAndUpdate(
      alertId,
      { isRead: true },
      { new: true }
    );
  }

  /* ===============================
     RESOLVE ALERT (🔥 IMPORTANT)
  =============================== */
  async resolveAlert(alertId: string) {
    return Alert.findByIdAndUpdate(
      alertId,
      { status: "resolved" },
      { new: true }
    );
  }

  /* ===============================
     DELETE ALERT
  =============================== */
  async deleteAlert(alertId: string) {
    return Alert.findByIdAndDelete(alertId);
  }
}

export default new AlertService();