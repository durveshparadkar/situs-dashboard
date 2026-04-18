import { Router } from "express";
import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import { checkUserLimit } from "../../shared/limits/user-limit.guard.js";
import { createUser, getUsers } from "./user.controller.js";

const router = Router();

/*
  🔥 DEV MODE ROUTES

  We REMOVE requireActiveBilling from create user.
  Billing should not block core functionality during development.

  Billing checks should be enforced later in production.
*/

// ===============================
// CREATE USER
// ===============================
router.post(
  "/",
  protect,
  authorize("CREATE_USER"),
  checkUserLimit,
  createUser
);

// ===============================
// GET USERS
// ===============================
router.get(
  "/",
  protect,
  authorize("READ_USER"),
  getUsers
);

export default router;









