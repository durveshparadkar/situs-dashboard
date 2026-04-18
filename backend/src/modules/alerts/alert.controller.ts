import AlertService from "./alert.service.js";

class AlertController {
  /* ===============================
     GET ALERTS
  =============================== */
  async getAlerts(req: any, res: any) {
    try {
      const orgId = req.user?.organizationId;

      if (!orgId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const alerts = await AlertService.getAlerts(orgId);

      res.json({
        success: true,
        count: alerts.length,
        data: alerts,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  /* ===============================
     MARK AS READ
  =============================== */
  async markAsRead(req: any, res: any) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "Alert ID required" });
      }

      const alert = await AlertService.markAsRead(id);

      res.json({
        success: true,
        data: alert,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  /* ===============================
     RESOLVE ALERT (🔥 NEW)
  =============================== */
  async resolveAlert(req: any, res: any) {
    try {
      const { id } = req.params;

      const alert = await AlertService.resolveAlert(id);

      res.json({
        success: true,
        data: alert,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  /* ===============================
     DELETE ALERT
  =============================== */
  async deleteAlert(req: any, res: any) {
    try {
      const { id } = req.params;

      await AlertService.deleteAlert(id);

      res.json({
        success: true,
        message: "Alert deleted",
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }

  /* ===============================
     UNREAD COUNT (🔥 UI POWER)
  =============================== */
  async getUnreadCount(req: any, res: any) {
    try {
      const orgId = req.user?.organizationId;

      const alerts = await AlertService.getAlerts(orgId);

      const unread = alerts.filter((a: any) => !a.isRead);

      res.json({
        success: true,
        count: unread.length,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }
}

export default new AlertController();