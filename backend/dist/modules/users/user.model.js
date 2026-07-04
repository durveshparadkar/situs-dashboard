import mongoose, { Schema, } from "mongoose";
import bcrypt from "bcryptjs";
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
    fullName: {
        type: String,
        trim: true,
        default: "",
    },
    password: {
        type: String,
        required: false,
        minlength: 6,
        select: false,
    },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local",
        index: true,
    },
    googleId: {
        type: String,
        default: null,
        index: true,
        sparse: true,
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
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isEmailVerified: {
        type: Boolean,
        default: false,
    },
    lastLoginAt: {
        type: Date,
        default: null,
    },
    resetPasswordToken: {
        type: String,
        default: null,
        select: false,
    },
    resetPasswordExpiry: {
        type: Date,
        default: null,
        select: false,
    },
}, {
    timestamps: true,
});
/* =====================================================
   UNIQUE CONSTRAINT (MULTI-TENANT SAFE)
===================================================== */
userSchema.index({ email: 1, organizationId: 1 }, { unique: true });
/* =====================================================
   PERFORMANCE INDEXES
===================================================== */
userSchema.index({ organizationId: 1, roleId: 1 });
userSchema.index({ organizationId: 1, managerId: 1 });
/* =====================================================
   NORMALIZATION + PASSWORD HASHING
===================================================== */
userSchema.pre("save", async function () {
    if (this.email) {
        this.email = this.email.trim().toLowerCase();
    }
    // Only hash if a password was actually set (skips Google-auth users)
    if (this.password && this.isModified("password")) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
});
/* =====================================================
   PASSWORD COMPARISON METHOD
===================================================== */
userSchema.methods.comparePassword = async function (candidatePassword) {
    // Google-auth users have no password — comparison always fails safely
    if (!this.password)
        return false;
    return bcrypt.compare(candidatePassword, this.password);
};
/* =====================================================
   GLOBAL SAFE TRANSFORM
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
   STATIC HELPERS
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