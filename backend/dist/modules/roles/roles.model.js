import mongoose, { Schema } from "mongoose";
/* =====================================================
   SCHEMA
===================================================== */
const roleSchema = new Schema({
    name: {
        type: String,
        required: true,
        enum: ["SUPER_ADMIN", "ORG_ADMIN", "MANAGER", "AGENT", "USER"],
        uppercase: true,
        trim: true,
        index: true,
    },
    permissions: {
        type: [String],
        default: [],
    },
    /* ================= SYSTEM CONTROL ================= */
    isSystem: {
        type: Boolean,
        default: true,
        index: true,
    },
    /* ================= MULTI-TENANT ================= */
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        default: null,
        index: true,
    },
}, {
    timestamps: true,
});
/* =====================================================
   🔥 UNIQUE CONSTRAINT
===================================================== */
// Prevent duplicate roles per org
roleSchema.index({ name: 1, organizationId: 1 }, { unique: true });
/* =====================================================
   🔥 DATA NORMALIZATION
===================================================== */
roleSchema.pre("validate", function () {
    const doc = this;
    if (doc.name) {
        doc.name = doc.name.toUpperCase();
    }
    // remove duplicate permissions
    if (doc.permissions?.length) {
        doc.permissions = [...new Set(doc.permissions)];
    }
});
/* =====================================================
   🚀 MODEL EXPORT
===================================================== */
const Role = mongoose.models.Role ||
    mongoose.model("Role", roleSchema);
export default Role;
//# sourceMappingURL=roles.model.js.map