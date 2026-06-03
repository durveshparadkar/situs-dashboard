import mongoose, { Schema, } from "mongoose";
/* =====================================================
   SCHEMA
===================================================== */
const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
        select: false, // 🔥 never expose
    },
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    roleId: {
        type: Schema.Types.ObjectId,
        ref: "Role",
        required: true,
        index: true,
    },
    role: {
        type: String,
        default: "user",
        index: true,
    },
    managerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    /* ================= SECURITY ================= */
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isEmailVerified: {
        type: Boolean,
        default: false,
    },
    /* ================= TRACKING ================= */
    lastLoginAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});
/* =====================================================
   🔒 UNIQUE CONSTRAINT (MULTI-TENANT SAFE)
===================================================== */
userSchema.index({ email: 1, organizationId: 1 }, { unique: true });
/* =====================================================
   ⚡ PERFORMANCE INDEXES
===================================================== */
userSchema.index({ organizationId: 1, roleId: 1 });
userSchema.index({ organizationId: 1, managerId: 1 });
/* =====================================================
   🧠 NORMALIZATION
===================================================== */
userSchema.pre("save", function () {
    if (this.email) {
        this.email = this.email.trim().toLowerCase();
    }
});
/* =====================================================
   🔐 PASSWORD COMPARISON METHOD
===================================================== */
import bcrypt from "bcryptjs";
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};
/* =====================================================
   🛡️ GLOBAL SAFE TRANSFORM
   (REMOVES SENSITIVE FIELDS)
===================================================== */
userSchema.set("toJSON", {
    transform: function (_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
    },
    virtuals: true,
});
/* =====================================================
   🧱 STATIC HELPERS (ENTERPRISE)
===================================================== */
userSchema.statics.findByEmailAndOrg = function (email, organizationId) {
    return this.findOne({
        email: email.toLowerCase(),
        organizationId,
    }).select("+password");
};
/* =====================================================
   MODEL
===================================================== */
const User = mongoose.models.User ||
    mongoose.model("User", userSchema);
export default User;
//# sourceMappingURL=user.model.js.map