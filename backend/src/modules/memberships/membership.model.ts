import mongoose, { Schema, Types, Model } from "mongoose";

/* =====================================================
   TYPES
===================================================== */

export type TeamRole = "ORG_ADMIN" | "MANAGER" | "AGENT" | "USER";

export type MembershipStatus =
  | "INVITED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REMOVED";

export interface IMembership {
  userId: Types.ObjectId;
  teamId: Types.ObjectId;

  role: TeamRole;
  status: MembershipStatus;

  invitedBy?: Types.ObjectId | null;
  joinedAt?: Date | null;

  isPrimary: boolean; // 🔥 main team of user (future use)

  createdAt: Date;
  updatedAt: Date;
}

type MembershipDocument = mongoose.HydratedDocument<IMembership>;

/* =====================================================
   SCHEMA
===================================================== */

const membershipSchema = new Schema<MembershipDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["ORG_ADMIN", "MANAGER", "AGENT", "USER"],
      required: true,
      index: true,
    },

    /* ================= STATE ================= */

    status: {
      type: String,
      enum: ["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"],
      default: "ACTIVE",
      index: true,
    },

    /* ================= AUDIT ================= */

    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },

    /* ================= FLAGS ================= */

    isPrimary: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =====================================================
   🔥 DATA NORMALIZATION
===================================================== */

membershipSchema.pre("validate", function () {
  const doc = this as MembershipDocument;

  // Ensure joinedAt only for ACTIVE users
  if (doc.status !== "ACTIVE") {
    doc.joinedAt = null;
  }

  // ORG_ADMIN must always be ACTIVE
  if (doc.role === "ORG_ADMIN") {
    doc.status = "ACTIVE";
  }
});

/* =====================================================
   🔥 UNIQUE CONSTRAINT
===================================================== */

// Prevent duplicate membership
membershipSchema.index(
  { userId: 1, teamId: 1 },
  { unique: true }
);

/* =====================================================
   🚀 ENTERPRISE INDEXES
===================================================== */

// team-based queries (dashboard, members list)
membershipSchema.index({ teamId: 1, status: 1 });

// user-based queries (multi-team support)
membershipSchema.index({ userId: 1, status: 1 });

// role-based filtering (RBAC)
membershipSchema.index({ teamId: 1, role: 1 });

// primary team lookup
membershipSchema.index({ userId: 1, isPrimary: 1 });

/* =====================================================
   MODEL (SAFE EXPORT)
===================================================== */

const Membership: Model<IMembership> =
  mongoose.models.Membership ||
  mongoose.model<IMembership>("Membership", membershipSchema);

export default Membership;
