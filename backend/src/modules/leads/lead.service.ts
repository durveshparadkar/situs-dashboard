import mongoose from "mongoose";
import Lead from "./lead.model.js";
import User from "../users/user.model.js";
import Pipeline, { IStage } from "../pipelines/pipeline.model.js";
import { CreateLeadInput, UpdateLeadInput } from "./lead.schema.js";
import { logLeadActivity } from "../leadActivity/leadActivity.service.js";
import LeadActivity from "../leadActivity/leadActivity.model.js";
import leadScoreService from "./leadScore.service.js";
import { brainQueue } from "../brain/brain.queue.js";

/* =====================================================
   TYPES
===================================================== */

interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

interface CurrentUser {
  _id: string;
  role: "org_admin" | "manager" | "agent";
  organizationId: string;
}

type LeadFilter = Record<string, unknown>;

class LeadService {
  /* =====================================================
     ERROR HELPER
  ===================================================== */

  private throwError(message: string, status: number): never {
    const error = new Error(message) as Error & { status?: number };
    error.status = status;
    throw error;
  }

  /* =====================================================
     BRAIN SCHEDULER
  ===================================================== */

  private async scheduleBrainAnalysis(leadId: string) {
    await brainQueue.add(
      "analyze",
      { leadId },
      {
        jobId: `brain-${leadId}`,
        delay: 2000,
        removeOnComplete: true,
      }
    );
  }

  /* =====================================================
     VISIBILITY ENGINE
  ===================================================== */

  private async buildVisibilityFilter(
    currentUser: CurrentUser
  ): Promise<LeadFilter> {
    const orgId = new mongoose.Types.ObjectId(
      currentUser.organizationId
    );

    const baseFilter: LeadFilter = { organizationId: orgId };

    if (currentUser.role === "org_admin") return baseFilter;

    if (currentUser.role === "agent") {
      return {
        ...baseFilter,
        assignedTo: new mongoose.Types.ObjectId(currentUser._id),
      };
    }

    if (currentUser.role === "manager") {
      const teamMembers = await User.find({
        organizationId: orgId,
        managerId: new mongoose.Types.ObjectId(currentUser._id),
      })
        .select("_id")
        .lean();

      const teamIds = teamMembers.map((u) => u._id);

      return {
        ...baseFilter,
        assignedTo: {
          $in: [
            new mongoose.Types.ObjectId(currentUser._id),
            ...teamIds,
          ],
        },
      };
    }

    return baseFilter;
  }

  /* =====================================================
     CREATE
  ===================================================== */

  async create(data: CreateLeadInput, currentUser: CurrentUser) {
    const orgId = new mongoose.Types.ObjectId(currentUser.organizationId);
    const userId = new mongoose.Types.ObjectId(currentUser._id);

    const defaultPipeline = await Pipeline.findOne({
      organizationId: orgId,
      isDefault: true,
    });

    if (!defaultPipeline)
      this.throwError("No default pipeline found", 400);

    if (!defaultPipeline.stages?.length)
      this.throwError("Default pipeline has no stages", 400);

    const firstStage: IStage = [...defaultPipeline.stages].sort(
      (a, b) => a.order - b.order
    )[0];

    const lead = await Lead.create({
      ...data,
      organizationId: orgId,
      assignedTo: userId,
      pipelineId: defaultPipeline._id,
      stageId: firstStage._id,
      probability: firstStage.probability,
      lastActivityAt: new Date(),
      isArchived: false,
    });

    await logLeadActivity({
      leadId: lead._id.toString(),
      action: "CREATED",
      userId: currentUser._id,
      newValue: lead,
    });

    await leadScoreService.calculateLeadScore(lead._id.toString());
    await this.scheduleBrainAnalysis(lead._id.toString());

    return lead;
  }

  /* =====================================================
     REQUEST ESCALATION (AGENT ONLY)
  ===================================================== */

  async requestEscalation(id: string, currentUser: CurrentUser) {
    if (currentUser.role !== "agent") {
      this.throwError("Only agents can request escalation", 403);
    }

    const lead = await this.findOne(id, currentUser);

    if (lead.escalation?.recommended) {
      this.throwError("Escalation already requested", 400);
    }

    lead.escalation = {
      recommended: true,
      approved: false,
      approvedAt: null,
      approvedBy: null,
    };

    lead.lastActivityAt = new Date();
    await lead.save();

    await logLeadActivity({
      leadId: lead._id.toString(),
      action: "ESCALATION_REQUESTED",
      userId: currentUser._id,
    });

    await this.scheduleBrainAnalysis(id);

    return lead;
  }

  /* =====================================================
     APPROVE ESCALATION (MANAGER / ORG ADMIN)
  ===================================================== */

  async approveEscalation(id: string, currentUser: CurrentUser) {
    if (
      currentUser.role !== "manager" &&
      currentUser.role !== "org_admin"
    ) {
      this.throwError("Unauthorized", 403);
    }

    const lead = await Lead.findById(id);
    if (!lead) this.throwError("Lead not found", 404);

    if (!lead.escalation?.recommended)
      this.throwError("No escalation to approve", 400);

    if (lead.escalation.approved)
      this.throwError("Escalation already approved", 400);

    const managerId = new mongoose.Types.ObjectId(currentUser._id);

    lead.assignedTo = managerId;

    lead.escalation = {
      ...lead.escalation,
      approved: true,
      approvedAt: new Date(),
      approvedBy: managerId,
    };

    lead.lastActivityAt = new Date();
    await lead.save();

    await logLeadActivity({
      leadId: lead._id.toString(),
      action: "ESCALATION_APPROVED",
      userId: currentUser._id,
    });

    await this.scheduleBrainAnalysis(id);

    return lead;
  }

  /* =====================================================
     UPDATE STAGE
  ===================================================== */

  async updateStage(
    id: string,
    stageName: string,
    currentUser: CurrentUser
  ) {
    const lead = await this.findOne(id, currentUser);

    const pipeline = await Pipeline.findById(lead.pipelineId);
    if (!pipeline) this.throwError("Pipeline not found", 404);

    const previousStageId = lead.stageId;

    const nextStage = pipeline.stages.find(
      (s: IStage) =>
        s.name.toLowerCase() === stageName.toLowerCase()
    );

    if (!nextStage)
      this.throwError(`Stage '${stageName}' does not exist`, 400);

    lead.stageId = nextStage._id;
    lead.probability = nextStage.probability;
    lead.lastActivityAt = new Date();

    await lead.save();

    await logLeadActivity({
      leadId: lead._id.toString(),
      action: "STAGE_CHANGED",
      userId: currentUser._id,
      previousValue: { stageId: previousStageId },
      newValue: { stageId: nextStage._id },
    });

    await leadScoreService.calculateLeadScore(id);
    await this.scheduleBrainAnalysis(id);

    return lead;
  }

  /* =====================================================
     ARCHIVE / RESTORE
  ===================================================== */

  async archive(id: string, currentUser: CurrentUser) {
    const lead = await this.findOne(id, currentUser);
    lead.isArchived = true;
    await lead.save();

    await logLeadActivity({
      leadId: lead._id.toString(),
      action: "ARCHIVED",
      userId: currentUser._id,
    });

    return lead;
  }

  async restore(id: string, currentUser: CurrentUser) {
    const lead = await this.findOne(id, currentUser);
    lead.isArchived = false;
    await lead.save();

    await logLeadActivity({
      leadId: lead._id.toString(),
      action: "RESTORED",
      userId: currentUser._id,
    });

    return lead;
  }

  /* =====================================================
     FIND ALL / FIND ONE
  ===================================================== */

  async findAll(query: PaginationQuery, currentUser: CurrentUser) {
    const visibilityFilter =
      await this.buildVisibilityFilter(currentUser);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { ...visibilityFilter };

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: "i" } },
        { email: { $regex: query.search, $options: "i" } },
      ];
    }

    const [data, total] = await Promise.all([
      Lead.find(filter).skip(skip).limit(limit),
      Lead.countDocuments(filter),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, currentUser: CurrentUser) {
    if (!mongoose.Types.ObjectId.isValid(id))
      this.throwError("Invalid lead ID", 400);

    const visibilityFilter =
      await this.buildVisibilityFilter(currentUser);

    const lead = await Lead.findOne({
      _id: new mongoose.Types.ObjectId(id),
      ...visibilityFilter,
    });

    if (!lead)
      this.throwError("Lead not found or access denied", 404);

    return lead;
  }

  /* =====================================================
     UPDATE
  ===================================================== */

  async update(
    id: string,
    data: UpdateLeadInput,
    currentUser: CurrentUser
  ) {
    const existing = await this.findOne(id, currentUser);

    const updatedLead = await Lead.findByIdAndUpdate(
      existing._id,
      { ...data, lastActivityAt: new Date() },
      { new: true, runValidators: true }
    );

    await leadScoreService.calculateLeadScore(id);
    await this.scheduleBrainAnalysis(id);

    return updatedLead;
  }

  /* =====================================================
     ACTIVITIES
  ===================================================== */

  async getActivities(
    leadId: string,
    currentUser: CurrentUser
  ) {
    await this.findOne(leadId, currentUser);

    return LeadActivity.find({ lead: leadId })
      .sort({ createdAt: -1 })
      .populate("performedBy", "email role");
  }

  async getIntelligenceSummary(
    currentUser: CurrentUser
  ) {
    const visibilityFilter =
      await this.buildVisibilityFilter(currentUser);

    const totalLeads =
      await Lead.countDocuments(visibilityFilter);

    const archivedLeads =
      await Lead.countDocuments({
        ...visibilityFilter,
        isArchived: true,
      });

    return {
      totalLeads,
      activeLeads: totalLeads - archivedLeads,
      archivedLeads,
    };
  }
}

export default new LeadService();