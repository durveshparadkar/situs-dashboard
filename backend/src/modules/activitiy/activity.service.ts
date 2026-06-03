import {
  Types,
} from "mongoose";

import Activity from "./activity.model.js";

import type {
  IActivity,
} from "./activity.model.js";

import type {
  UnifiedActivity,
} from "./activity.types.js";

import { ApiError } from "../../utils/ApiError.js";

/* =====================================================
   HELPERS
===================================================== */

function toObjectId(
  id: string | Types.ObjectId
): Types.ObjectId {
  if (id instanceof Types.ObjectId) {
    return id;
  }

  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(
      "Invalid ObjectId"
    );
  }

  return new Types.ObjectId(id);
}

/* =====================================================
   SERVICE
===================================================== */

class ActivityService {
  /* =====================================================
     INGEST SINGLE
  ===================================================== */

  async ingest(
    activity: UnifiedActivity
  ) {
    const existing =
      await (Activity as any)
        .findOne({
          externalId:
            activity.externalId,

          provider:
            activity.provider,
        })
        .exec();

    if (existing) {
      return existing;
    }

    const created =
      await Activity.create({
        externalId:
          activity.externalId,

        organizationId:
          toObjectId(
            activity.organizationId
          ),

        provider:
          activity.provider,

        type:
          activity.type,

        severity:
          activity.severity ??
          "medium",

        title:
          activity.title,

        description:
          activity.description,

        sentiment:
          activity.sentiment,

        metadata:
          activity.metadata ??
          {},

        occurredAt:
          activity.occurredAt,
      });

    return created;
  }

  /* =====================================================
     BULK INGEST
  ===================================================== */

  async bulkIngest(
    activities: UnifiedActivity[]
  ) {
    if (!activities.length) {
      return {
        inserted: 0,
      };
    }

    const operations =
      activities.map(
        (activity) => ({
          updateOne: {
            filter: {
              externalId:
                activity.externalId,

              provider:
                activity.provider,
            },

            update: {
              $setOnInsert: {
                externalId:
                  activity.externalId,

                organizationId:
                  toObjectId(
                    activity.organizationId
                  ),

                provider:
                  activity.provider,

                type:
                  activity.type,

                severity:
                  activity.severity ??
                  "medium",

                title:
                  activity.title,

                description:
                  activity.description,

                sentiment:
                  activity.sentiment,

                metadata:
                  activity.metadata ??
                  {},

                occurredAt:
                  activity.occurredAt,
              },
            },

            upsert: true,
          },
        })
      );

    const result =
      await (Activity as any)
        .bulkWrite(
          operations,
          {
            ordered: false,
          }
        );

    return {
      inserted:
        result.upsertedCount || 0,
    };
  }

  /* =====================================================
     TIMELINE
  ===================================================== */

  async getTimeline(
    organizationId: string,
    limit = 50
  ) {
    return (Activity as any)
      .find({
        organizationId:
          toObjectId(
            organizationId
          ),
      })
      .sort({
        occurredAt: -1,
      })
      .limit(limit)
      .lean()
      .exec();
  }

  /* =====================================================
     PROVIDER
  ===================================================== */

  async getByProvider(
    organizationId: string,
    provider: string
  ) {
    return (Activity as any)
      .find({
        organizationId:
          toObjectId(
            organizationId
          ),

        provider,
      })
      .sort({
        occurredAt: -1,
      })
      .lean()
      .exec();
  }

  /* =====================================================
     RECENT RISKS
  ===================================================== */

  async getRecentRisks(
    organizationId: string
  ) {
    return (Activity as any)
      .find({
        organizationId:
          toObjectId(
            organizationId
          ),

        type: "risk",
      })
      .sort({
        occurredAt: -1,
      })
      .limit(20)
      .lean()
      .exec();
  }

  /* =====================================================
     SENTIMENT SUMMARY
  ===================================================== */

  async getSentimentSummary(
    organizationId: string
  ) {
    return Activity.aggregate([
      {
        $match: {
          organizationId:
            toObjectId(
              organizationId
            ),
        },
      },

      {
        $group: {
          _id: "$sentiment",

          count: {
            $sum: 1,
          },
        },
      },
    ]);
  }
}

export default new ActivityService();