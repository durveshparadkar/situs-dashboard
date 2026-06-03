import { Schema, model, models, } from "mongoose";
import bcrypt from "bcryptjs";
/* ================= SCHEMA ================= */
const authUserSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        default: "User",
    },
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
        select: false,
    },
    // 🔥 FIX: use roleId instead of role string
    roleId: {
        type: Schema.Types.ObjectId,
        ref: "Role",
        required: true,
        index: true,
    },
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
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
   🔒 UNIQUE (MULTI-TENANT SAFE)
===================================================== */
authUserSchema.index({ email: 1, organizationId: 1 }, { unique: true });
/* ================= NAME SAFETY ================= */
authUserSchema.pre("validate", function () {
    const user = this;
    if (!user.name || !user.name.trim()) {
        user.name = "User";
    }
});
/* ================= NORMALIZATION ================= */
authUserSchema.pre("save", function () {
    const user = this;
    if (user.email) {
        user.email = user.email.trim().toLowerCase();
    }
});
/* ================= PASSWORD HASH ================= */
authUserSchema.pre("save", async function () {
    const user = this;
    if (!user.isModified("password"))
        return;
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
});
/* ================= PASSWORD COMPARE ================= */
authUserSchema.methods.comparePassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};
/* ================= SAFE TRANSFORM ================= */
authUserSchema.set("toJSON", {
    transform: function (_doc, ret) {
        const r = ret;
        delete r.password;
        delete r.__v;
        return r;
    },
});
/* ================= MODEL ================= */
const AuthUser = models.AuthUser ||
    model("AuthUser", authUserSchema);
export default AuthUser;
//# sourceMappingURL=auth.model.js.map