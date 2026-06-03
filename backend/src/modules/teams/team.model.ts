import mongoose, {
  Schema,
  Types,
  HydratedDocument,
  Model,
} from "mongoose";

/* ================= TYPES ================= */

export interface ITeam {
  name: string;
  organizationId: Types.ObjectId;

  createdBy: Types.ObjectId;

  managerId?: Types.ObjectId | null; // 🔥 hierarchy support

  members: Types.ObjectId[];

  isActive: boolean; // 🔥 soft delete
  memberCount: number; // 🔥 performance optimization

  createdAt: Date;
  updatedAt: Date;
}

export type TeamDocument = HydratedDocument<ITeam>;

/* ================= SCHEMA ================= */

const teamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    managerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    memberCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* ================= VALIDATION ================= */

teamSchema.pre("validate", function () {
  const team = this as TeamDocument;

  if (!team.name || !team.name.trim()) {
    team.name = "Team";
  } else {
    team.name = team.name.trim();
  }
});

/* ================= MEMBER SYNC ================= */

teamSchema.pre("save", function () {
  const team = this as TeamDocument;

  // 🔥 Remove duplicates
  if (team.members?.length) {
    team.members = Array.from(
      new Set(team.members.map((id) => id.toString()))
    ).map((id) => new mongoose.Types.ObjectId(id));
  }

  // 🔥 Maintain count (no aggregation needed later)
  team.memberCount = team.members?.length || 0;
});

/* ================= INDEXES ================= */

// 🔥 Multi-tenant safety
teamSchema.index({ organizationId: 1, name: 1 });

// 🔥 Manager hierarchy queries
teamSchema.index({ organizationId: 1, managerId: 1 });

// 🔥 Active teams filtering
teamSchema.index({ organizationId: 1, isActive: 1 });

/* ================= MODEL ================= */

const Team: Model<ITeam> =
  (mongoose.models.Team as Model<ITeam>) ||
  mongoose.model<ITeam>("Team", teamSchema);

export default Team;



