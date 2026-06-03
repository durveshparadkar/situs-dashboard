import { Types } from "mongoose";

/* =====================================================
   GLOBAL EXPRESS TYPES (ENTERPRISE SAFE)
===================================================== */

declare global {
  namespace Express {
    interface AuthUser {
      _id: string;
      organizationId?: string | Types.ObjectId | null;
      role?: string;
      email?: string;
    }

    interface Request {
      user?: AuthUser;

      /* ================= OPTIONAL EXTENSIONS ================= */

      requestId?: string; // tracing (logs, observability)
      ipAddress?: string; // rate limiting / security
    }
  }
}

export {};




