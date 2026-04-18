import { Request, Response } from "express";
import { z } from "zod";
import Entity from "./entity.model.js";

/* =====================================================
   TYPES
===================================================== */

interface AuthRequest extends Request {
  user?: {
    _id: string;
    organizationId?: string;
  };
}

/* =====================================================
   VALIDATION SCHEMAS
===================================================== */

const createEntitySchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  type: z.string().trim().min(1, "Type is required").max(100),
  description: z.string().trim().max(1000).optional(),
});

const querySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
});

/* =====================================================
   CREATE ENTITY
===================================================== */

export const createEntity = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?._id || !req.user.organizationId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const validated = createEntitySchema.parse(req.body);

    const entity = await Entity.create({
      title: validated.title,
      type: validated.type,
      description: validated.description,
      ownerId: req.user._id,
      organizationId: req.user.organizationId,
    });

    return res.status(201).json({
      success: true,
      data: entity,
    });
  } catch (error) {
    console.error("ENTITY CREATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create entity",
    });
  }
};

/* =====================================================
   GET ENTITIES (Paginated + Search + Sort)
===================================================== */

export const getEntities = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?.organizationId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const validatedQuery = querySchema.parse(req.query);

    const page = Math.max(parseInt(validatedQuery.page || "1"), 1);
    const limit = Math.min(parseInt(validatedQuery.limit || "10"), 100);
    const skip = (page - 1) * limit;

    const search = validatedQuery.search?.trim();
    const sortField = validatedQuery.sort || "-createdAt";

    const filter: any = {
      organizationId: req.user.organizationId,
    };

    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const [entities, total] = await Promise.all([
      Entity.find(filter)
        .sort(sortField)
        .skip(skip)
        .limit(limit),
      Entity.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      data: entities,
    });
  } catch (error) {
    console.error("ENTITY FETCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch entities",
    });
  }
};























