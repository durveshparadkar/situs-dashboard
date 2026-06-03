// seedSuperAdmin.ts
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../modules/users/user.model.js";
import Role from "../modules/rbac/role.model.js";
import Organization from "../modules/organizations/organization.model.js";
import { dbLogger } from "../utils/logger.js";

// ============================================================
// CONFIG (ENV DRIVEN)
// All defaults are safe-by-failure: missing required vars throw
// rather than seeding with weak credentials.
// ============================================================

const SEED_CONFIG = {
  superAdmin: {
    email:      process.env.SUPER_ADMIN_EMAIL    || "admin@situs.com",
    password:   process.env.SUPER_ADMIN_PASSWORD || "",
    firstName:  process.env.SUPER_ADMIN_FIRSTNAME || "Super",
    lastName:   process.env.SUPER_ADMIN_LASTNAME  || "Admin",
  },

  organization: {
    name: process.env.PLATFORM_ORG_NAME || "Situs Platform",
    slug: process.env.PLATFORM_ORG_SLUG || "situs-platform",
  },

  password: {
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
    minLength:    12,
  },

  defaultRoleName: "SUPER_ADMIN",
} as const;

// ============================================================
// HELPERS
// ============================================================

/**
 * Validate the configured super admin password meets minimum strength.
 * Refuses to seed in production if the password is empty or weak.
 */
function validatePassword(password: string): void {
  const isProd = process.env.NODE_ENV === "production";

  if (!password || password.length === 0) {
    if (isProd) {
      throw new Error(
        "SUPER_ADMIN_PASSWORD environment variable is required in production"
      );
    }
    dbLogger.warn(
      "SUPER_ADMIN_PASSWORD not set — using fallback (dev only)"
    );
    return;
  }

  if (password.length < SEED_CONFIG.password.minLength) {
    throw new Error(
      `SUPER_ADMIN_PASSWORD must be at least ${SEED_CONFIG.password.minLength} characters`
    );
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

  if (!hasLetter || !hasNumber || (isProd && !hasSymbol)) {
    throw new Error(
      "SUPER_ADMIN_PASSWORD must contain letters, numbers" +
        (isProd ? ", and at least one symbol" : "")
    );
  }
}

/**
 * Sanitize a user document for logging — strips password and tokens.
 * Never log raw user records — they contain hashed passwords.
 */
function safeLogUser(user: unknown): Record<string, unknown> {
  if (!user || typeof user !== "object") return {};
  const u = user as Record<string, unknown>;
  return {
    id:    u._id ? String(u._id) : undefined,
    email: u.email,
    role:  u.role,
  };
}

// ============================================================
// SEED OPERATIONS
// ============================================================

interface SeedResult {
  organization: {
    id:      string;
    name:    string;
    created: boolean;
  };
  role: {
    id:      string;
    name:    string;
    created: boolean;
  };
  user: {
    id:      string;
    email:   string;
    created: boolean;
  };
}

/**
 * Ensure the platform organization exists. Returns the existing or newly
 * created record. Idempotent.
 */
async function ensurePlatformOrganization(): Promise<{
  id:      string;
  name:    string;
  created: boolean;
}> {
  const OrgModel = Organization as unknown as {
    findOne: (filter: Record<string, unknown>) => Promise<{ _id: unknown; name?: string } | null>;
    create:  (data: Record<string, unknown>) => Promise<{ _id: unknown; name?: string }>;
  };

  const existing = await OrgModel.findOne({
    slug: SEED_CONFIG.organization.slug,
  });

  if (existing) {
    return {
      id:      String(existing._id),
      name:    String(existing.name ?? SEED_CONFIG.organization.name),
      created: false,
    };
  }

  const created = await OrgModel.create({
    name:      SEED_CONFIG.organization.name,
    slug:      SEED_CONFIG.organization.slug,
    isActive:  true,
    isPlatform: true,
  });

  dbLogger.info(
    "Platform organization created: id=" + String(created._id) +
    " name=" + SEED_CONFIG.organization.name
  );

  return {
    id:      String(created._id),
    name:    String(created.name ?? SEED_CONFIG.organization.name),
    created: true,
  };
}

/**
 * Ensure the SUPER_ADMIN role exists as a system role.
 * System roles have organizationId: null and isSystem: true.
 * Idempotent.
 */
async function ensureSuperAdminRole(): Promise<{
  id:      string;
  name:    string;
  created: boolean;
}> {
  const RoleModel = Role as unknown as {
    findOne: (filter: Record<string, unknown>) => Promise<{ _id: unknown; name?: string } | null>;
    create:  (data: Record<string, unknown>) => Promise<{ _id: unknown; name?: string }>;
  };

  const existing = await RoleModel.findOne({
    name:           SEED_CONFIG.defaultRoleName,
    organizationId: null,
  });

  if (existing) {
    return {
      id:      String(existing._id),
      name:    String(existing.name ?? SEED_CONFIG.defaultRoleName),
      created: false,
    };
  }

  const created = await RoleModel.create({
    name:           SEED_CONFIG.defaultRoleName,
    description:    "Platform-wide administrator with full access",
    permissions:    [],
    inherits:       [],
    organizationId: null,
    isSystem:       true,
    isActive:       true,
    priority:       1000,
  });

  dbLogger.info(
    "SUPER_ADMIN role created: id=" + String(created._id)
  );

  return {
    id:      String(created._id),
    name:    String(created.name ?? SEED_CONFIG.defaultRoleName),
    created: true,
  };
}

/**
 * Ensure the super admin user exists, linked to the platform org and role.
 * Idempotent: returns existing user if email already taken.
 */
async function ensureSuperAdminUser(
  organizationId: string,
  roleId: string
): Promise<{
  id:      string;
  email:   string;
  created: boolean;
}> {
  const normalizedEmail = SEED_CONFIG.superAdmin.email.trim().toLowerCase();

  const UserModel = User as unknown as {
    findOne: (filter: Record<string, unknown>) => Promise<{ _id: unknown; email?: string } | null>;
    create:  (data: Record<string, unknown>) => Promise<{ _id: unknown; email?: string }>;
  };

  const existing = await UserModel.findOne({ email: normalizedEmail });

  if (existing) {
    return {
      id:      String(existing._id),
      email:   String(existing.email ?? normalizedEmail),
      created: false,
    };
  }

  // Resolve the password — fall back to dev default if absent
  const rawPassword =
    SEED_CONFIG.superAdmin.password ||
    (process.env.NODE_ENV !== "production" ? "ChangeMe@123" : "");

  if (!rawPassword) {
    throw new Error(
      "Cannot seed super admin: no password configured in production"
    );
  }

  const hashedPassword = await bcrypt.hash(
    rawPassword,
    SEED_CONFIG.password.bcryptRounds
  );

  const created = await UserModel.create({
    email:          normalizedEmail,
    password:       hashedPassword,
    firstName:      SEED_CONFIG.superAdmin.firstName,
    lastName:       SEED_CONFIG.superAdmin.lastName,
    role:           "SUPER_ADMIN",
    roleId,
    organizationId,
    isActive:       true,
    isVerified:     true,
    emailVerifiedAt: new Date(),
  });

  dbLogger.info(
    "Super admin user created: " + JSON.stringify(safeLogUser(created))
  );

  return {
    id:      String(created._id),
    email:   String(created.email ?? normalizedEmail),
    created: true,
  };
}

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

/**
 * Seed the platform's super admin account end-to-end:
 *   1. Validate password strength
 *   2. Ensure platform organization exists
 *   3. Ensure SUPER_ADMIN role exists
 *   4. Ensure super admin user exists, linked to both
 *
 * Idempotent — running this multiple times is safe.
 * Returns a summary of what was created vs already existed.
 */
export async function seedSuperAdmin(): Promise<SeedResult> {
  dbLogger.info("Starting super admin seed...");

  try {
    // Step 1: Validate password before any DB work
    validatePassword(SEED_CONFIG.superAdmin.password);

    // Step 2: Ensure platform organization
    const organization = await ensurePlatformOrganization();

    // Step 3: Ensure SUPER_ADMIN role
    const role = await ensureSuperAdminRole();

    // Step 4: Ensure super admin user
    const user = await ensureSuperAdminUser(organization.id, role.id);

    const result: SeedResult = { organization, role, user };

    // Summary log
    const summary =
      "org=" + (organization.created ? "created" : "exists") +
      " role=" + (role.created ? "created" : "exists") +
      " user=" + (user.created ? "created" : "exists");

    if (organization.created || role.created || user.created) {
      dbLogger.info("Super admin seed complete: " + summary);
    } else {
      dbLogger.info("Super admin seed: nothing to do (all entities exist)");
    }

    return result;
  } catch (err) {
    dbLogger.error(
      "Super admin seed failed: " +
      ((err as Error)?.message ?? "unknown error")
    );
    throw err;
  }
}

// ============================================================
// CLI ENTRYPOINT
// Run via: node dist/seeders/seedSuperAdmin.js --seed-admin
//      or: tsx src/seeders/seedSuperAdmin.ts --seed-admin
// ============================================================

async function runCli(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI environment variable is required");
    process.exit(1);
  }

  let exitCode = 0;

  try {
    dbLogger.info("Connecting to MongoDB for seed run...");
    await mongoose.connect(mongoUri);
    dbLogger.info("MongoDB connected");

    const result = await seedSuperAdmin();

    console.log("\n=== Seed Summary ===");
    console.log("Organization: " + (result.organization.created ? "CREATED" : "EXISTS") + " (id=" + result.organization.id + ")");
    console.log("Role:         " + (result.role.created         ? "CREATED" : "EXISTS") + " (id=" + result.role.id + ")");
    console.log("User:         " + (result.user.created         ? "CREATED" : "EXISTS") + " (email=" + result.user.email + ")");

    if (result.user.created && process.env.NODE_ENV !== "production") {
      console.log(
        "\nDev login credentials (CHANGE IMMEDIATELY):"
      );
      console.log("  Email:    " + result.user.email);
      console.log("  Password: " + (SEED_CONFIG.superAdmin.password || "ChangeMe@123"));
    }
  } catch (err) {
    console.error("Seed failed:", (err as Error)?.message ?? err);
    exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
      dbLogger.info("MongoDB disconnected");
    } catch (err) {
      dbLogger.warn(
        "Error during disconnect: " + ((err as Error)?.message ?? "unknown")
      );
    }
    process.exit(exitCode);
  }
}

// Detect CLI invocation
if (process.argv.includes("--seed-admin")) {
  void runCli();
}

export default seedSuperAdmin;
