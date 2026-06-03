import mongoose, { Types } from "mongoose";
import User from "./user.model.js";
import Role from "../rbac/role.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { hashPassword } from "../../utils/hash.js";
/* ================= HELPERS ================= */
function toObjectId(id) {
    if (id instanceof Types.ObjectId)
        return id;
    if (!Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest("Invalid ObjectId");
    }
    return new Types.ObjectId(id);
}
/* ======================================================
   🚀 USER SERVICE (ENTERPRISE SAFE)
====================================================== */
class UserService {
    /* ================= CREATE USER ================= */
    async create(data, currentUser) {
        const session = await mongoose.startSession();
        try {
            let createdUser = null;
            await session.withTransaction(async () => {
                const orgId = toObjectId(currentUser.organizationId);
                /* 🔒 VALIDATE ROLE */
                const role = await Role.findOne({
                    _id: toObjectId(data.roleId),
                    $or: [{ organizationId: null }, { organizationId: orgId }],
                }).session(session);
                if (!role) {
                    throw ApiError.badRequest("Invalid role");
                }
                /* 🔒 DUPLICATE CHECK */
                const existing = await User.findOne({
                    email: data.email.toLowerCase(),
                    organizationId: orgId,
                }).session(session);
                if (existing) {
                    throw ApiError.conflict("User already exists");
                }
                /* 🔐 HASH PASSWORD */
                const hashedPassword = await hashPassword(data.password);
                const [user] = await User.create([
                    {
                        email: data.email.toLowerCase(),
                        password: hashedPassword,
                        organizationId: orgId,
                        roleId: role._id,
                        managerId: data.managerId
                            ? toObjectId(data.managerId)
                            : null,
                        isActive: true,
                        lastLoginAt: null,
                    },
                ], { session });
                if (!user) {
                    throw ApiError.internal("User creation failed");
                }
                createdUser = user;
            });
            return createdUser;
        }
        finally {
            session.endSession();
        }
    }
    /* ================= GET USERS ================= */
    async findAll(currentUser) {
        const orgId = toObjectId(currentUser.organizationId);
        return User.find({ organizationId: orgId })
            .select("-password")
            .populate("roleId")
            .lean();
    }
    /* ================= GET ONE ================= */
    async findOne(id, currentUser) {
        const user = await User.findOne({
            _id: toObjectId(id),
            organizationId: toObjectId(currentUser.organizationId),
        })
            .select("-password")
            .populate("roleId");
        if (!user) {
            throw ApiError.notFound("User not found");
        }
        return user;
    }
    /* ================= UPDATE ================= */
    async update(id, data, currentUser) {
        const orgId = toObjectId(currentUser.organizationId);
        const updateData = {};
        if (data.email) {
            updateData.email = data.email.toLowerCase();
        }
        if (data.roleId) {
            const role = await Role.findOne({
                _id: toObjectId(data.roleId),
                $or: [{ organizationId: null }, { organizationId: orgId }],
            });
            if (!role) {
                throw ApiError.badRequest("Invalid role");
            }
            updateData.roleId = role._id;
        }
        if (data.managerId !== undefined) {
            updateData.managerId = data.managerId
                ? toObjectId(data.managerId)
                : null;
        }
        if (data.isActive !== undefined) {
            updateData.isActive = data.isActive;
        }
        const updated = await User.findOneAndUpdate({
            _id: toObjectId(id),
            organizationId: orgId,
        }, updateData, { new: true })
            .select("-password")
            .populate("roleId");
        if (!updated) {
            throw ApiError.notFound("User not found");
        }
        return updated;
    }
    /* ================= DELETE ================= */
    async remove(id, currentUser) {
        const orgId = toObjectId(currentUser.organizationId);
        const user = await User.findOneAndDelete({
            _id: toObjectId(id),
            organizationId: orgId,
        });
        if (!user) {
            throw ApiError.notFound("User not found");
        }
        return { deleted: true };
    }
    /* ================= LOGIN TRACK ================= */
    async updateLastLogin(userId) {
        await User.findByIdAndUpdate(userId, {
            lastLoginAt: new Date(),
        });
    }
}
export default new UserService();
//# sourceMappingURL=user.service.js.map