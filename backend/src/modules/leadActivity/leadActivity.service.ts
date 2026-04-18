import LeadActivity, {
  LeadActivityAction,
} from "./leadActivity.model.js";

import Lead from "../leads/lead.model.js";
import LeadScoreService from "../leads/leadScore.service.js";

interface LogLeadActivityInput {
  leadId: string;
  action: LeadActivityAction;
  userId: string;
  previousValue?: unknown;
  newValue?: unknown;
}

export const logLeadActivity = async ({
  leadId,
  action,
  userId,
  previousValue,
  newValue,
}: LogLeadActivityInput) => {
  /* ============================
     1️⃣ SAVE ACTIVITY
  ============================ */
  await LeadActivity.create({
    lead: leadId,
    action,
    performedBy: userId,
    previousValue,
    newValue,
  });

  /* ============================
     2️⃣ UPDATE LEAD (🔥 IMPORTANT)
  ============================ */
  const lead = await Lead.findById(leadId);

  if (!lead) return;

  lead.activityCount += 1;
  lead.lastActivityAt = new Date();

  await lead.save();

  /* ============================
     3️⃣ TRIGGER SCORING (🔥 CORE)
  ============================ */
  await LeadScoreService.calculateLeadScore(leadId);
};