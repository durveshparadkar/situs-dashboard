import DealService from "./deal.service.js";
import {
  validateCreateDeal,
  validateUpdateDeal,
} from "./deal.validation.js";

class DealController {
  async createDeal(req: any, res: any) {
    try {
      validateCreateDeal(req.body);

      const deal = await DealService.createDeal(
        req.body,
        req.user.id,
        req.user.organizationId
      );

      res.json(deal);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async getDeals(req: any, res: any) {
    try {
      const deals = await DealService.getDeals(
        req.user.organizationId
      );

      res.json(deals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async updateDeal(req: any, res: any) {
    try {
      validateUpdateDeal(req.body);

      const deal = await DealService.updateDeal(
        req.params.id,
        req.body,
        req.user.id
      );

      res.json(deal);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}

export default new DealController();