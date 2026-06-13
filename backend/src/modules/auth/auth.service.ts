import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";

import User from "../users/user.model.js";
import Organization from "../organizations/organization.model.js";
import Role from "../rbac/role.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import { ApiError } from "../../utils/ApiError.js";

/* ================= TYPES ================= */

interface RegisterInput {
  email: string;
  password: string;
  organizationName?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

/* ================= JWT ================= */

const ACCESS_SECRET = process.env.JWT_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? ACCESS_SECRET;

function signAccessToken(payload: any) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

function signRefreshToken(payload: any) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "7d" });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "workspace";
}

async function ensureOrgAdminRole(session?: mongoose.ClientSession) {
  const existing = await Role.findOne({
    name: "ORG_ADMIN",
    organizationId: null,
  }).session(session ?? null);

  if (existing) return existing;

  const [role] = await Role.create(
    [
      {
        name: "ORG_ADMIN",
        description: "Organization administrator",
        permissions: [],
        inherits: [],
        organizationId: null,
        isSystem: true,
        isActive: true,
        priority: 900,
      },
    ],
    session ? { session } : undefined
  );

  if (!role) {
    throw ApiError.internal("Default role missing");
  }

  return role;
}

/* ======================================================
   DEFAULT PIPELINE BOOTSTRAP
====================================================== */
async function createDefaultPipeline(
  organizationId: Types.ObjectId,
  session: mongoose.ClientSession
) {
  const [pipeline] = await Pipeline.create(
    [
      {
        name: "Default Pipeline",
        organizationId,
        isDefault: true,
        stages: [
          { name: "DISCOVERY",     order: 0, probability: 10, color: "#94A3B8", isClosed: false, isWon: false, isLost: false },
          { name: "QUALIFICATION", order: 1, probability: 25, color: "#60A5FA", isClosed: false, isWon: false, isLost: false },
          { name: "PROPOSAL_SENT", order: 2, probability: 50, color: "#3B82F6", isClosed: false, isWon: false, isLost: false },
          { name: "NEGOTIATION",   order: 3, probability: 75, color: "#8B5CF6", isClosed: false, isWon: false, isLost: false },
          { name: "VERBAL_COMMIT", order: 4, probability: 90, color: "#A855F7", isClosed: false, isWon: false, isLost: false },
          { name: "CONTRACT_SENT", order: 5, probability: 95, color: "#D946EF", isClosed: false, isWon: false, isLost: false },
          { name: "WON",           order: 6, probability: 100, color: "#10B981", isClosed: true,  isWon: true,  isLost: false },
          { name: "LOST",          order: 7, probability: 0,   color: "#EF4444", isClosed: true,  isWon: false, isLost: true  },
        ],
      },
    ],
    { session }
  );

  if (!pipeline) {
    throw ApiError.internal("Default pipeline creation failed");
  }

  return pipeline;
}

/* ======================================================
   🚀 AUTH SERVICE
====================================================== */

class AuthService {
  /* ================= REGISTER ================= */

  async register(input: RegisterInput) {
    const session = await mongoose.startSession();

    try {
      let createdUser: any;
      let createdOrg: any;

      await session.withTransaction(async () => {
        const email = input.email.toLowerCase();

        const existing = await User.findOne({ email }).session(session);
        if (existing) {
          throw ApiError.conflict("User already exists");
        }

        /* ================= CREATE ORG ================= */
        const orgName =
          input.organizationName?.trim() ||
          "Default Organization";

        const [org] = await Organization.create(
          [
            {
              name: orgName,
              slug: `${slugify(orgName)}-${Date.now().toString(36)}`,
              plan: "SMALL_BUSINESS",
            },
          ],
          { session }
        );

        if (!org) {
          throw ApiError.internal("Organization creation failed");
        }

        /* ================= GET DEFAULT ROLE ================= */
        const role = await ensureOrgAdminRole(session);

        /* ================= CREATE USER =================
           CRITICAL: set both roleId (DB reference) AND role (string).
           The role string field is what auth.middleware.ts reads to
           determine permissions — without it, every user defaults to
           "USER" which can't create deals or access intelligence. */
     const [user] = await User.create(
  [
    {
      email,
      password:       input.password,
      organizationId: org._id,
      roleId:         role._id,
      role:           "ORG_ADMIN",
    },
  ],
  { session }
);

if (!user) {
  throw ApiError.internal("User creation failed");
}

        /* ================= CREATE DEFAULT PIPELINE =================
           Atomic with the rest of signup. */
        await createDefaultPipeline(org._id, session);

        createdUser = user;
        createdOrg = org;
      });

      /* ================= TOKENS ================= */

      const payload = {
        id: createdUser._id.toString(),
        organizationId: createdOrg._id.toString(),
        roleId: createdUser.roleId.toString(),
      };

      const accessToken = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      return {
        user: createdUser,
        organization: createdOrg,
        accessToken,
        refreshToken,
      };
    } finally {
      session.endSession();
    }
  }

  /* ================= LOGIN ================= */

  async login(input: LoginInput) {
    const email = input.email.toLowerCase();

    const user = await User.findOne({ email })
      .select("+password email organizationId roleId role isActive isEmailVerified lastLoginAt createdAt updatedAt");

    if (!user) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    if (!user.isActive) {
      throw ApiError.forbidden("User is inactive");
    }

    const isMatch = await user.comparePassword(input.password);

    if (!isMatch) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    /* ================= BACKFILL ROLE STRING =================
       Pre-existing accounts created before role-string was added
       only have roleId. Backfill the role string field so
       permission middleware can read it. Runs once per legacy user.

       Uses untyped access since the User schema may not declare
       the role field — Mongoose stores it anyway when set. */
    const userAny = user as any;
if (!userAny.role || !userAny.roleId) {
  const adminRole = await ensureOrgAdminRole();
  userAny.role = "ORG_ADMIN";
  userAny.roleId = adminRole._id;
  await User.findByIdAndUpdate(user._id, {
    role: "ORG_ADMIN",
    roleId: adminRole._id,
  });
}

    let org = await Organization.findById(user.organizationId)
      .select("_id name slug plan createdAt updatedAt");

    if (!org) {
      org = await Organization.create({
        name: "Personal Workspace",
        slug: `workspace-${user._id.toString()}`,
        plan: "PRO",
      });

      await User.findByIdAndUpdate(user._id, {
        organizationId: org._id,
      });

      /* If we had to recreate the org on login, also ensure a
         default pipeline exists. Outside transaction since this
         is a recovery path. */
      const existingPipeline = await Pipeline.findOne({
        organizationId: org._id,
      });
      if (!existingPipeline) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await createDefaultPipeline(org!._id, session);
          });
        } finally {
          session.endSession();
        }
      }
    }

    /* ================= BACKFILL PIPELINE =================
       Pre-existing accounts with an org but no pipeline.
       Same recovery path applied to the happy login path. */
    const existingPipeline = await Pipeline.findOne({
      organizationId: org._id,
    });
    if (!existingPipeline) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await createDefaultPipeline(org!._id, session);
        });
      } finally {
        session.endSession();
      }
    }

    /* ================= TOKENS ================= */

    const payload = {
      id: user._id.toString(),
      organizationId: org._id.toString(),
      roleId: String(
        typeof user.roleId === "object" && "_id" in user.roleId
          ? user.roleId._id
          : user.roleId
      ),
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    /* ================= TRACK LOGIN ================= */

    void User.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date(),
    }).catch(() => undefined);

    return {
      user,
      organization: org,
      accessToken,
      refreshToken,
    };
  }

  /* ================= PROFILE ================= */

  async getProfile(userId: string) {
    const user = await User.findById(userId)
      .select("-password")
      .populate("roleId");

    if (!user) {
      throw ApiError.notFound("User not found");
    }

    return user;
  }

  /* ================= REFRESH ================= */

  async refresh(refreshToken: string) {
    try {
      const decoded: any = jwt.verify(
        refreshToken,
        REFRESH_SECRET
      );

      const payload = {
        id: decoded.id,
        organizationId: decoded.organizationId,
        roleId: decoded.roleId,
      };

      const accessToken = signAccessToken(payload);

      return { accessToken };
    } catch {
      throw ApiError.unauthorized("Invalid refresh token");
    }
  }
}

const authService = new AuthService();

export default authService;
export const register = authService.register.bind(authService);
export const login = authService.login.bind(authService);
export const getProfile = authService.getProfile.bind(authService);
export const refresh = authService.refresh.bind(authService);

