import { Request, Response, NextFunction } from "express";
import { redis } from "../../config/redis.js";

export const cache =
  (keyBuilder: (req: Request) => string, ttl = 60) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyBuilder(req);
      const cached = await redis.get(key);

      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }

      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        redis.setex(key, ttl, JSON.stringify(body));
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error("⚠️ Cache middleware failed:", err);
      next(); // fail open
    }
  };
