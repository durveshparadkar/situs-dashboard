// publicDemo.routes.ts
//
// Public, UNAUTHENTICATED endpoint for the marketing site's "Book Demo"
// form. Anonymous website visitors submit here — there is no logged-in
// user, so this route deliberately sits outside lead.routes.ts (which
// requires protect on every route).
//
// The submitted lead is created under Durvesh's own Situs organization
// (source: WEBSITE_FORM), so it shows up directly in the Leads pipeline
// with AI scoring like any other lead.

import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import Lead from "./lead.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import { LeadSource } from "../../shared/enums/lead.enums.js";
import { sendDemoRequestNotification } from "../../utils/mailer.js";

const router = Router();

/* =====================================================
   CONFIG — set these to your real Situs org + your own user ID.
   Every demo request lands as a lead owned by you.
===================================================== */

const SITUS_ORG_ID = process.env.SITUS_DEMO_ORG_ID || "";
const SITUS_OWNER_USER_ID = process.env.SITUS_DEMO_OWNER_ID || "";

/* =====================================================
   RATE LIMIT — public endpoint, defend against spam/bot abuse
===================================================== */

const demoRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // 5 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again in a few minutes.",
  },
});

/* =====================================================
   VALIDATION
===================================================== */

const demoRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    email: z.string().trim().toLowerCase().email("Invalid email format"),
    company: z.string().trim().max(200).optional(),
    message: z.string().trim().max(2000).optional(),
    phone: z.string().trim().max(30).optional(),
  })
  .strict();

/* =====================================================
   ROUTE — POST /api/public/demo-request
===================================================== */

router.post(
  "/demo-request",
  demoRequestLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!SITUS_ORG_ID || !SITUS_OWNER_USER_ID) {
        console.error(
          "Demo request misconfigured: SITUS_DEMO_ORG_ID / SITUS_DEMO_OWNER_ID env vars not set"
        );
        res.status(500).json({
          success: false,
          message: "Demo requests are temporarily unavailable. Please email us directly.",
        });
        return;
      }

      const parsed = demoRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: parsed.error.issues.map((e) => e.message).join("; "),
        });
        return;
      }

      const { name, email, company, message, phone } = parsed.data;

      /* Find the default pipeline + its first stage, so the lead lands
         in a valid pipeline position like any manually created lead. */
      const pipeline = await Pipeline.findOne({
        organizationId: SITUS_ORG_ID,
        isDefault: true,
      });

      if (!pipeline || !pipeline.stages?.length) {
        console.error("Demo request: no default pipeline found for org", SITUS_ORG_ID);
        res.status(500).json({
          success: false,
          message: "Something went wrong on our end. Please email us directly.",
        });
        return;
      }

      const firstStage = [...pipeline.stages].sort((a, b) => a.order - b.order)[0];

      if (!firstStage) {
        console.error("Demo request: no stages found in default pipeline", SITUS_ORG_ID);
        res.status(500).json({
          success: false,
          message: "Something went wrong on our end. Please email us directly.",
        });
        return;
      }

      const lead = await Lead.create({
        name,
        phone: phone?.trim() || "Not provided",
        email,
        budget: 0, // Unknown at demo-request stage — rep fills this in after the call
        interestedLocation: company?.trim() || "Not specified",
        source: LeadSource.WEBSITE_FORM,
        organizationId: SITUS_ORG_ID,
        assignedTo: SITUS_OWNER_USER_ID,
        pipelineId: pipeline._id,
        stageId: firstStage._id,
        notes: message?.trim()
          ? `Demo request message: "${message.trim()}"`
          : "Demo requested via website — no additional message.",
      });

      console.log(
  `New demo request: name=${name} email=${email} company=${company ?? "n/a"} leadId=${lead._id}`
);

/* Fire the email notification — don't block or fail the response if
   email sending has an issue, the lead is already saved either way. */
const notificationPayload: {
  name: string;
  email: string;
  company?: string;
  message?: string;
} = { name, email };

if (company) notificationPayload.company = company;
if (message) notificationPayload.message = message;

void sendDemoRequestNotification(notificationPayload);

res.status(201).json({
  success: true,
  message: "Thanks! We'll be in touch shortly to schedule your demo.",
});
    } catch (err) {
      next(err);
    }
  }
);

export default router;
