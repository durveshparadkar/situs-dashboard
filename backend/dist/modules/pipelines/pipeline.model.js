import mongoose, { Schema } from "mongoose";
/* =====================================================
   STAGE SCHEMA
===================================================== */
const stageSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        default: "Stage",
    },
    order: {
        type: Number,
        required: true,
        min: 0,
    },
    probability: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
    },
    color: {
        type: String,
        default: "#3B82F6",
    },
    isClosed: {
        type: Boolean,
        default: false,
        index: true,
    },
    isWon: {
        type: Boolean,
        default: false,
        index: true,
    },
    isLost: {
        type: Boolean,
        default: false,
        index: true,
    },
}, {
    _id: true,
});
/* =====================================================
   PIPELINE SCHEMA
===================================================== */
const pipelineSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        default: "Pipeline",
        index: true,
    },
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    isDefault: {
        type: Boolean,
        default: false,
        index: true,
    },
    stages: {
        type: [stageSchema],
        required: true,
        validate: {
            validator: (val) => val.length > 0,
            message: "Pipeline must have at least one stage",
        },
    },
}, {
    timestamps: true,
    minimize: false,
});
/* =====================================================
   🔥 STAGE VALIDATION + NORMALIZATION
===================================================== */
pipelineSchema.pre("validate", function () {
    const pipeline = this;
    let stages = pipeline.stages || [];
    if (!stages.length) {
        throw new Error("Pipeline must have at least one stage");
    }
    /* ================= SORT BY ORDER ================= */
    stages = stages.sort((a, b) => a.order - b.order);
    /* ================= UNIQUE ORDER ================= */
    const orderSet = new Set();
    for (const stage of stages) {
        if (orderSet.has(stage.order)) {
            throw new Error("Stage order must be unique");
        }
        orderSet.add(stage.order);
    }
    /* ================= NORMALIZATION ================= */
    let wonCount = 0;
    let lostCount = 0;
    stages.forEach((stage) => {
        // Clean name
        stage.name = stage.name?.trim() || "Stage";
        // Normalize booleans
        stage.isWon = !!stage.isWon;
        stage.isLost = !!stage.isLost;
        // Auto-close logic
        if (stage.isWon || stage.isLost) {
            stage.isClosed = true;
        }
        if (stage.isWon)
            wonCount++;
        if (stage.isLost)
            lostCount++;
    });
    if (wonCount > 1) {
        throw new Error("Only one WON stage allowed");
    }
    if (lostCount > 1) {
        throw new Error("Only one LOST stage allowed");
    }
    /* ================= SAVE BACK ================= */
    pipeline.stages = stages;
});
/* =====================================================
   🔥 DEFAULT PIPELINE GUARANTEE (STRONG)
===================================================== */
pipelineSchema.pre("save", async function () {
    const pipeline = this;
    if (!pipeline.isModified("isDefault"))
        return;
    if (!pipeline.isDefault)
        return;
    await mongoose.model("Pipeline").updateMany({
        organizationId: pipeline.organizationId,
        _id: { $ne: pipeline._id },
    }, { $set: { isDefault: false } });
});
/* =====================================================
   🚀 ENTERPRISE INDEXES
===================================================== */
// multi-tenant core queries
pipelineSchema.index({ organizationId: 1, isDefault: 1 });
// fast lookup by org + name
pipelineSchema.index({ organizationId: 1, name: 1 });
// stage querying (future analytics)
pipelineSchema.index({ "stages._id": 1 });
// sorting pipelines
pipelineSchema.index({ createdAt: -1 });
/* =====================================================
   MODEL (SAFE EXPORT)
===================================================== */
const Pipeline = mongoose.models.Pipeline ||
    mongoose.model("Pipeline", pipelineSchema);
export default Pipeline;
//# sourceMappingURL=pipeline.model.js.map