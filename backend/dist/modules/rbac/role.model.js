// role.model.ts
import mongoose, { Schema, } from "mongoose";
// ============================================================
// CONFIG / CONSTANTS
// ============================================================
const ROLE_CONFIG = {
    caps: {
        name: 100,
        description: 500,
        permissions: 500,
        inherits: 20,
    },
    reservedNames: [
        "SUPER_ADMIN",
        "ORG_ADMIN",
        "MANAGER",
        "AGENT",
        "USER",
    ],
};
// ============================================================
// SCHEMA
// ============================================================
const roleSchema = new Schema({
    name: {
        type: String,
        required: [true, "Role name is required"],
        trim: true,
        uppercase: true,
        minlength: [2, "Role name must be at least 2 characters"],
        maxlength: [ROLE_CONFIG.caps.name, "Role name too long"],
        index: true,
    },
    description: {
        type: String,
        trim: true,
        maxlength: [ROLE_CONFIG.caps.description, "Description too long"],
        default: "",
    },
    permissions: {
        type: [
            {
                type: Schema.Types.ObjectId,
                ref: "Permission",
            },
        ],
        default: [],
        validate: {
            validator: function (arr) {
                return Array.isArray(arr) && arr.length <= ROLE_CONFIG.caps.permissions;
            },
            message: "Too many permissions on a single role",
        },
    },
    inherits: {
        type: [
            {
                type: Schema.Types.ObjectId,
                ref: "Role",
            },
        ],
        default: [],
        validate: {
            validator: function (arr) {
                return Array.isArray(arr) && arr.length <= ROLE_CONFIG.caps.inherits;
            },
            message: "Too many inherited roles",
        },
    },
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        default: null,
        index: true,
    },
    isSystem: {
        type: Boolean,
        default: false,
        index: true,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    color: {
        type: String,
        trim: true,
        match: [/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex (e.g. #10B981)"],
    },
    priority: {
        type: Number,
        default: 0,
        min: 0,
        max: 1000,
        index: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
    minimize: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});
// ============================================================
// VIRTUALS
// ============================================================
roleSchema.virtual("isCustom").get(function () {
    return !this.isSystem;
});
roleSchema.virtual("isOrgScoped").get(function () {
    return this.organizationId !== null && this.organizationId !== undefined;
});
// ============================================================
// VALIDATION & NORMALIZATION (PRE-VALIDATE)
// Mongoose PreMiddlewareFunction signature: (opts?, next?)
// Param order: opts is first, next is second.
// ============================================================
roleSchema.pre("validate", function (_opts, next) {
    // Normalize name
    if (this.name) {
        this.name = this.name.trim().toUpperCase();
    }
    // Dedupe permissions
    if (this.permissions && this.permissions.length > 0) {
        const seen = new Set();
        const out = [];
        for (const p of this.permissions) {
            const id = p.toString();
            if (!seen.has(id)) {
                seen.add(id);
                out.push(new mongoose.Types.ObjectId(id));
            }
        }
        this.permissions = out;
    }
    // Dedupe inherits + reject self-inheritance
    if (this.inherits && this.inherits.length > 0) {
        const seen = new Set();
        const out = [];
        const selfId = this._id ? this._id.toString() : "";
        for (const r of this.inherits) {
            const id = r.toString();
            if (id === selfId) {
                if (next)
                    return next(new Error("A role cannot inherit from itself"));
                return;
            }
            if (!seen.has(id)) {
                seen.add(id);
                out.push(new mongoose.Types.ObjectId(id));
            }
        }
        this.inherits = out;
    }
    // Reserved-name protection for non-system custom roles
    if (!this.isSystem &&
        this.name &&
        ROLE_CONFIG.reservedNames.includes(this.name)) {
        if (next) {
            return next(new Error("Role name '" + this.name + "' is reserved for system roles"));
        }
        return;
    }
    if (next)
        next();
});
// ============================================================
// PRE-SAVE: AUDIT TRAIL HELPERS
// ============================================================
roleSchema.pre("save", function (_opts, next) {
    // Auto-set deletedAt when soft-deleting via direct field flip
    if (this.isModified("isDeleted")) {
        if (this.isDeleted && !this.deletedAt) {
            this.deletedAt = new Date();
        }
        else if (!this.isDeleted) {
            this.deletedAt = null;
        }
    }
    if (next)
        next();
});
// ============================================================
// QUERY HELPERS - default exclude soft-deleted
// ============================================================
roleSchema.pre(/^find/, function (_opts, next) {
    // Only apply default filter if the caller didn't explicitly set isDeleted
    const conditions = this.getFilter();
    if (conditions.isDeleted === undefined) {
        this.where({ isDeleted: { $ne: true } });
    }
    if (next)
        next();
});
// ============================================================
// INSTANCE METHODS
// ============================================================
roleSchema.methods.hasPermission = function (permissionId) {
    const target = permissionId.toString();
    return this.permissions.some((p) => p.toString() === target);
};
roleSchema.methods.isInheriting = function (roleId) {
    if (!this.inherits || this.inherits.length === 0)
        return false;
    const target = roleId.toString();
    return this.inherits.some((r) => r.toString() === target);
};
roleSchema.methods.softDelete = async function (actorId) {
    if (this.isSystem) {
        throw new Error("System roles cannot be deleted");
    }
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.isActive = false;
    if (actorId) {
        this.updatedBy = new mongoose.Types.ObjectId(actorId.toString());
    }
    return this.save();
};
roleSchema.methods.restore = async function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.isActive = true;
    return this.save();
};
// ============================================================
// STATIC METHODS
// ============================================================
roleSchema.statics.findActiveByOrg = function (organizationId) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    return this.find({
        $or: [
            { organizationId: null },
            { organizationId: orgId },
        ],
        isActive: true,
    })
        .sort({ priority: -1, name: 1 })
        .exec();
};
roleSchema.statics.findSystemRoles = function () {
    return this.find({ isSystem: true, isActive: true })
        .sort({ priority: -1, name: 1 })
        .exec();
};
roleSchema.statics.findByName = function (name, organizationId) {
    const normalized = name.trim().toUpperCase();
    if (organizationId === undefined || organizationId === null) {
        return this.findOne({ name: normalized, organizationId: null }).exec();
    }
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    return this.findOne({ name: normalized, organizationId: orgId }).exec();
};
// ============================================================
// INDEXES
// Unique strategy:
//   - System roles (organizationId: null) -> globally unique by name
//   - Custom roles (organizationId: <id>)  -> unique per org by name
// ============================================================
roleSchema.index({ name: 1, organizationId: 1 }, {
    unique: true,
    name: "uniq_role_name_per_org",
});
// Query-pattern indexes
roleSchema.index({ organizationId: 1, isSystem: 1, isActive: 1 });
roleSchema.index({ organizationId: 1, isDeleted: 1 });
roleSchema.index({ organizationId: 1, priority: -1 });
roleSchema.index({ createdAt: -1 });
// ============================================================
// MODEL
// ============================================================
const Role = mongoose.models.Role ||
    mongoose.model("Role", roleSchema);
export default Role;
//# sourceMappingURL=role.model.js.map