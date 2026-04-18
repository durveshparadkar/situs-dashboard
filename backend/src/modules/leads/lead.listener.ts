import { eventBus } from "../../shared/events/eventBus.js";
import Lead from "./lead.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import whatsappService from "../whatsapp/whatsapp.service.js";

/* =====================================================
   LEAD CREATED
===================================================== */
eventBus.on("LEAD_CREATED", async (payload) => {
  try {
    const lead = await Lead.findById(payload.entityId);

    if (!lead) return;

    // Basic welcome template
    await whatsappService.sendTemplateMessage(
      lead.phone,
      "lead_created_template",
      {
        name: lead.name,
      }
    );

    console.log("✅ WhatsApp sent for LEAD_CREATED:", lead._id);
  } catch (error) {
    console.error("❌ LEAD_CREATED listener error:", error);
  }
});

/* =====================================================
   LEAD STAGE CHANGED
===================================================== */
eventBus.on("LEAD_STAGE_CHANGED", async (payload) => {
  try {
    const lead = await Lead.findById(payload.leadId);

    if (!lead) return;

    const pipeline = await Pipeline.findById(lead.pipelineId);
    if (!pipeline) return;

    const stage = pipeline.stages.find(
      (s: any) => s._id.toString() === payload.newStageId
    );

    if (!stage) return;

    // 🔥 Rule 1 — Site Visit
    if (stage.name === "Site Visit") {
      await whatsappService.sendTemplateMessage(
        lead.phone,
        "site_visit_reminder",
        {
          name: lead.name,
        }
      );
    }

    // 🔥 Rule 2 — Closed Won
    if (stage.name === "Closed Won") {
      await whatsappService.sendTemplateMessage(
        lead.phone,
        "closed_won_congratulations",
        {
          name: lead.name,
        }
      );
    }

    console.log(
      "✅ WhatsApp automation triggered for stage:",
      stage.name
    );
  } catch (error) {
    console.error("❌ LEAD_STAGE_CHANGED listener error:", error);
  }
});