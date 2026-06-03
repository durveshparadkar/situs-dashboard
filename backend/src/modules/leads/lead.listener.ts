import { Types } from "mongoose";
import {
  eventBus,
  type LeadCreatedPayload,
  type LeadStageChangedPayload,
} from "../../shared/events/eventBus.js";
import Lead from "./lead.model.js";
import whatsappService from "../whatsapp/whatsapp.service.js";

/* =====================================================
   HELPERS
===================================================== */

function toObjectId(id: string): Types.ObjectId | null {
  if (!Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
}

/* =====================================================
   WHATSAPP SAFE WRAPPER (NO CRASH)
===================================================== */

async function safeWhatsAppSend(
  phone: string,
  template: string,
  variables: Record<string, unknown>
) {
  try {
    await whatsappService.sendTemplateMessage(
      phone,
      template,
      variables
    );
  } catch (err) {
    console.error("WhatsApp failed:", {
      template,
      phone,
      error: err,
    });
  }
}

/* =====================================================
   LEAD CREATED
   Bus publishes: { leadId, organizationId, source?, stage?, assignedTo? }
===================================================== */

eventBus.on("LEAD_CREATED", async (payload: LeadCreatedPayload) => {
  const leadObjId = toObjectId(payload.leadId);
  if (!leadObjId) return;

  try {
    const lead = await Lead.findById(leadObjId).lean();
    if (!lead) return;

    /* Lead model may not have phone/name fields typed strictly — read safely */
    const phone = (lead as unknown as { phone?: string }).phone;
    const name  = (lead as unknown as { name?:  string }).name;
    if (!phone) return;

    await safeWhatsAppSend(phone, "lead_created_template", {
      name: name ?? "Customer",
    });

    console.log("LEAD_CREATED processed:", String(lead._id));
  } catch (error) {
    console.error("LEAD_CREATED listener error:", error);
  }
});

/* =====================================================
   LEAD STAGE CHANGED
   Bus publishes the stage NAME directly (newStage), not an id.
   No pipeline lookup needed.
===================================================== */

const STAGE_ACTIONS: Record<string, { template: string }> = {
  "Site Visit":   { template: "site_visit_reminder" },
  "Closed Won":   { template: "closed_won_congratulations" },
};

eventBus.on(
  "LEAD_STAGE_CHANGED",
  async (payload: LeadStageChangedPayload) => {
    const leadObjId = toObjectId(payload.leadId);
    if (!leadObjId) return;

    const action = STAGE_ACTIONS[payload.newStage];
    if (!action) return;

    try {
      const lead = await Lead.findById(leadObjId).lean();
      if (!lead) return;

      const phone = (lead as unknown as { phone?: string }).phone;
      const name  = (lead as unknown as { name?:  string }).name;
      if (!phone) return;

      await safeWhatsAppSend(phone, action.template, {
        name: name ?? "Customer",
      });

      console.log("Stage automation:", payload.newStage);
    } catch (error) {
      console.error("LEAD_STAGE_CHANGED error:", error);
    }
  }
);