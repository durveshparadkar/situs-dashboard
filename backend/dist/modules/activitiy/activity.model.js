import { Schema, model, models, } from "mongoose";
/* =====================================================
   SCHEMA
===================================================== */
const activitySchema = new Schema({
    externalId: {
        type: String,
        required: true,
        index: true,
    },
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    provider: {
        type: String,
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: [
            "email",
            "slack",
            "meeting",
            "risk",
            "opportunity",
        ],
        required: true,
        index: true,
    },
    severity: {
        type: String,
        enum: [
            "low",
            "medium",
            "high",
            "critical",
        ],
        default: "medium",
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    sentiment: {
        type: String,
        enum: [
            "positive",
            "neutral",
            "negative",
        ],
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {},
    },
    occurredAt: {
        type: Date,
        required: true,
        index: true,
    },
}, {
    timestamps: true,
});
/* =====================================================
   INDEXES
===================================================== */
activitySchema.index({
    organizationId: 1,
    occurredAt: -1,
});
activitySchema.index({
    organizationId: 1,
    provider: 1,
});
activitySchema.index({
    organizationId: 1,
    type: 1,
});
/* =====================================================
   UNIQUE EVENT SAFETY
===================================================== */
activitySchema.index({
    externalId: 1,
    provider: 1,
}, {
    unique: true,
});
/* =====================================================
   MODEL
===================================================== */
const Activity = models.Activity ||
    model("Activity", activitySchema);
export default Activity;
//# sourceMappingURL=activity.model.js.map