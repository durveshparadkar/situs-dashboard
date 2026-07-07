import mongoose from "mongoose";
import Organization, {
  IOrganization,
  type OrganizationCurrency,
} from "./organization.model.js";

/* ================= TYPES ================= */

interface CurrentUser {
  _id: string;
  role: "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "AGENT";
  organizationId: string;
}

interface CreateOrgInput {
  name: string;
}

export interface UpdateOrgInput {
  name?: string;
  settings?: {
    timezone?: string;
    currency?: OrganizationCurrency;
  };
}

/* ======================================================
   🚀 ORGANIZATION SERVICE (ENTERPRISE)
====================================================== */
class OrganizationService {
  /* ================= ERROR ================= */

  private throwError(message: string, status = 400): never {
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }

  private toObjectId(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      this.throwError("Invalid ID", 400);
    }
    return new mongoose.Types.ObjectId(id);
  }

  /* ================= CREATE ================= */

  async create(data: CreateOrgInput) {
    const org = await Organization.create({
      name: data.name,
    });

    return org;
  }

  /* ================= GET CURRENT ================= */

  async getCurrent(currentUser: CurrentUser) {
    const org = await Organization.findOne({
      _id: this.toObjectId(currentUser.organizationId),
      isDeleted: false,
    }).lean();

    if (!org) this.throwError("Organization not found", 404);

    return org;
  }

  /* ================= UPDATE ================= */

  async update(data: UpdateOrgInput, currentUser: CurrentUser) {
    if (
      currentUser.role !== "ORG_ADMIN" &&
      currentUser.role !== "SUPER_ADMIN"
    ) {
      this.throwError("Unauthorized", 403);
    }

    const orgId = this.toObjectId(currentUser.organizationId);

    const updateData: Partial<IOrganization> = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.settings) {
      updateData.settings = {};
      if (data.settings.timezone !== undefined) {
        updateData.settings.timezone = data.settings.timezone;
      }
      if (data.settings.currency !== undefined) {
        updateData.settings.currency = data.settings.currency;
      }
    }

    const updated = await Organization.findByIdAndUpdate(
      orgId,
      updateData,
      { new: true }
    ).lean();

    if (!updated) this.throwError("Update failed", 500);

    return updated;
  }
  

  /* ================= DELETE (SOFT DELETE) ================= */

  async delete(currentUser: CurrentUser) {
    if (currentUser.role !== "SUPER_ADMIN") {
      this.throwError("Only SUPER_ADMIN can delete org", 403);
    }

    const orgId = this.toObjectId(currentUser.organizationId);

    const updated = await Organization.findByIdAndUpdate(
      orgId,
      {
        isDeleted: true,
        isActive: false,
      },
      { new: true }
    );

    if (!updated) this.throwError("Organization not found", 404);

    return { success: true };
  }

  /* ================= ACTIVATE / DEACTIVATE ================= */

  async setActive(
    isActive: boolean,
    orgId: string,
    currentUser: CurrentUser
  ) {
    if (currentUser.role !== "SUPER_ADMIN") {
      this.throwError("Unauthorized", 403);
    }

    const updated = await Organization.findByIdAndUpdate(
      this.toObjectId(orgId),
      { isActive },
      { new: true }
    ).lean();

    if (!updated) this.throwError("Organization not found", 404);

    return updated;
  }

  /* ================= BILLING UPDATE ================= */

  async updateBilling(
    orgId: string,
    billingStatus: IOrganization["billingStatus"],
    currentUser: CurrentUser
  ) {
    if (currentUser.role !== "SUPER_ADMIN") {
      this.throwError("Unauthorized", 403);
    }

    const updated = await Organization.findByIdAndUpdate(
      this.toObjectId(orgId),
      {
        billingStatus,
      },
      { new: true }
    ).lean();

    if (!updated) this.throwError("Organization not found", 404);

    return updated;
  }

  /* ================= LIST (SUPER ADMIN ONLY) ================= */

  async listAll(currentUser: CurrentUser) {
    if (currentUser.role !== "SUPER_ADMIN") {
      this.throwError("Unauthorized", 403);
    }

    return Organization.find({})
      .sort({ createdAt: -1 })
      .lean();
  }
}

export default new OrganizationService();
