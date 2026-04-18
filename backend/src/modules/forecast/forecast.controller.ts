import ForecastService from "./forecast.service.js";
import { validateForecastQuery } from "./forecast.validation.js";

class ForecastController {
  async getForecast(req: any, res: any) {
    try {
      const orgId = req.user?.organizationId;

      if (!orgId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      validateForecastQuery(req.query);

      const data = await ForecastService.getForecast(
        orgId,
        req.query.range
      );

      res.json({
        success: true,
        data,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message,
      });
    }
  }
}

export default new ForecastController();