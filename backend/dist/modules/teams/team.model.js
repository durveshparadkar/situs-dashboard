import mongoose, { Schema, } from "mongoose";
/* ================= SCHEMA ================= */
const teamSchema = new Schema({
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
}, {
    timestamps: true,
    minimize: false,
});
/* ================= VALIDATION ================= */
teamSchema.pre("validate", function () {
    const team = this;
    if (!team.name || !team.name.trim()) {
        team.name = "Team";
    }
    else {
        team.name = team.name.trim();
    }
});
/* ================= MEMBER SYNC ================= */
teamSchema.pre("save", function () {
    const team = this;
    // 🔥 Remove duplicates
    if (team.members?.length) {
        team.members = Array.from(new Set(team.members.map((id) => id.toString()))).map((id) => new mongoose.Types.ObjectId(id));
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
const Team = mongoose.models.Team ||
    mongoose.model("Team", teamSchema);
export default Team;
//# sourceMappingURL=team.model.js.map