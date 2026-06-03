import mongoose, { Types } from "mongoose";
import Lead from "./lead.model.js";
import User from "../users/user.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import { logLeadActivity } from "../leadActivity/leadActivity.service.js";
import LeadActivity from "../leadActivity/leadActivity.model.js";
import leadScoreService from "./leadScore.service.js";
import { brainQueue } from "../brain/brain.queue.js";
class LeadService {
    /* ================= CORE UTILS ================= */
    throwError(message, status) {
        const err = new Error(message);
        err.status = status;
        throw err;
    }
    toObjectId(id) {
        if (!Types.ObjectId.isValid(id)) {
            this.throwError("Invalid ID", 400);
        }
        return new Types.ObjectId(id);
    }
    /* ================= BACKGROUND TASKS ================= */
    async triggerAsync(leadId) {
        Promise.allSettled([
            leadScoreService.calculateLeadScore(leadId),
            this.queueBrain(leadId),
        ]);
    }
    async queueBrain(leadId) {
        try {
            await brainQueue.add("analyze", {
                leadId,
                type: "analyze_lead",
                organizationId: ""
            }, {
                jobId: `brain-${leadId}`,
                delay: 2000,
                removeOnComplete: true,
            });
        }
        catch {
            console.warn("⚠️ Brain skipped");
        }
    }
    /* ================= VISIBILITY ================= */
    async buildFilter(user) {
        const orgId = this.toObjectId(user.organizationId);
        if (user.role === "org_admin") {
            return { organizationId: orgId };
        }
        if (user.role === "agent") {
            return {
                organizationId: orgId,
                assignedTo: this.toObjectId(user._id),
            };
        }
        if (user.role === "manager") {
            const team = await User.find({
                organizationId: orgId,
                managerId: this.toObjectId(user._id),
            })
                .select("_id")
                .lean();
            return {
                organizationId: orgId,
                assignedTo: {
                    $in: [
                        this.toObjectId(user._id),
                        ...team.map((t) => t._id),
                    ],
                },
            };
        }
        return { organizationId: orgId };
    }
    /* ================= CREATE ================= */
    async create(data, user) {
        const session = await mongoose.startSession();
        try {
            let createdId = null;
            await session.withTransaction(async () => {
                const orgId = this.toObjectId(user.organizationId);
                const userId = this.toObjectId(user._id);
                const pipeline = await Pipeline.findOne({
                    organizationId: orgId,
                    isDefault: true,
                }).session(session);
                if (!pipeline)
                    this.throwError("No default pipeline", 400);
                const stage = pipeline.stages
                    .slice()
                    .sort((a, b) => a.order - b.order)[0];
                if (!stage)
                    this.throwError("No stages found", 400);
                /* ✅ CLEAN PAYLOAD (NO UNDEFINED ANYWHERE) */
                const payload = {
                    name: data.name,
                    phone: data.phone,
                    email: data.email ?? null,
                    budget: data.budget,
                    interestedLocation: data.interestedLocation,
                    source: data.source,
                    organizationId: orgId,
                    assignedTo: userId,
                    pipelineId: pipeline._id,
                    stageId: stage._id,
                    probability: stage.probability,
                    lastActivityAt: new Date(),
                    isArchived: false,
                };
                const doc = await new Lead(payload).save({ session });
                createdId = doc._id;
                await logLeadActivity({
                    leadId: createdId.toString(),
                    action: "CREATED",
                    userId: user._id,
                });
            });
            if (!createdId) {
                this.throwError("Creation failed", 500);
            }
            // 🔥 TYPE SAFE CAST (guaranteed after check)
            const leadId = createdId;
            this.triggerAsync(leadId.toString());
            return Lead.findById(leadId);
        }
        finally {
            session.endSession();
        }
    }
    /* ================= FIND ================= */
    async findAll(query, user) {
        const filter = await this.buildFilter(user);
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(50, Number(query.limit) || 10);
        const mongoFilter = { ...filter };
        if (query.search) {
            mongoFilter.$or = [
                { name: { $regex: query.search, $options: "i" } },
                { email: { $regex: query.search, $options: "i" } },
            ];
        }
        const [data, total] = await Promise.all([
            Lead.find(mongoFilter)
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Lead.countDocuments(mongoFilter),
        ]);
        return {
            data,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findOne(id, user) {
        const filter = await this.buildFilter(user);
        const lead = await Lead.findOne({
            _id: this.toObjectId(id),
            ...filter,
        });
        if (!lead)
            this.throwError("Lead not found", 404);
        return lead;
    }
    /* ================= UPDATE ================= */
    async update(id, data, user) {
        const existing = await this.findOne(id, user);
        const update = { ...data };
        if ("email" in update) {
            update.email = update.email ?? null;
        }
        const updated = await Lead.findByIdAndUpdate(existing._id, {
            ...update,
            lastActivityAt: new Date(),
        }, { new: true });
        if (!updated)
            this.throwError("Update failed", 500);
        await logLeadActivity({
            leadId: id,
            action: "UPDATED",
            userId: user._id,
        });
        this.triggerAsync(id);
        return updated;
    }
    /* ================= STAGE ================= */
    async updateStage(id, stageName, user) {
        const lead = await this.findOne(id, user);
        const pipeline = await Pipeline.findById(lead.pipelineId).lean();
        if (!pipeline)
            this.throwError("Pipeline not found", 404);
        const stage = pipeline.stages.find((s) => s.name.toLowerCase() === stageName.toLowerCase());
        if (!stage)
            this.throwError("Invalid stage", 400);
        lead.stageId = stage._id;
        lead.probability = stage.probability;
        lead.lastActivityAt = new Date();
        await lead.save();
        await logLeadActivity({
            leadId: id,
            action: "STAGE_CHANGED",
            userId: user._id,
        });
        this.triggerAsync(id);
        return lead;
    }
    /* ================= ARCHIVE ================= */
    async archive(id, user) {
        const lead = await this.findOne(id, user);
        lead.isArchived = true;
        await lead.save();
        return lead;
    }
    async restore(id, user) {
        const lead = await this.findOne(id, user);
        lead.isArchived = false;
        await lead.save();
        return lead;
    }
    /* ================= ACTIVITIES ================= */
    async getActivities(id, user) {
        await this.findOne(id, user);
        return LeadActivity.find({ lead: id })
            .sort({ createdAt: -1 })
            .lean();
    }
    /* ================= SUMMARY ================= */
    async getIntelligenceSummary(user) {
        const filter = await this.buildFilter(user);
        const [total, archived] = await Promise.all([
            Lead.countDocuments(filter),
            Lead.countDocuments({ ...filter, isArchived: true }),
        ]);
        return {
            totalLeads: total,
            activeLeads: total - archived,
            archivedLeads: archived,
        };
    }
}
export default new LeadService();
//# sourceMappingURL=lead.service.js.map