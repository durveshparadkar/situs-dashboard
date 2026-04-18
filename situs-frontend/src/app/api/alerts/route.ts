import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import Deal from "../../models/deal";
import Lead from "../../models/lead";
import { generateAlerts } from "../../../lib/alert-engine";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type DealDoc = {
  _id: unknown;
  title?: unknown;
  value?: unknown;
  stage?: unknown;
  probability?: unknown;
  updatedAt?: unknown;
};

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Alerts fetched") {
  return NextResponse.json(
    { success: true, message, data },
    { status: 200 }
  );
}

function error(message = "Something went wrong", status = 500) {
  return NextResponse.json(
    { success: false, message, data: [] },
    { status }
  );
}

function normalizeStage(stage: unknown): string {
  if (typeof stage !== "string") return "Leads";

  const map: Record<string, string> = {
    lead: "Leads",
    qualified: "Qualified",
    proposal: "Proposal",
    negotiation: "Negotiation",
    won: "Won",
  };

  return map[stage.toLowerCase()] || "Leads";
}

function safeNumber(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/* ================= GET ================= */

export async function GET() {
  try {
    await connectDB();

    const [leadsRaw, dealsRaw] = await Promise.all([
      Lead.find().lean().limit(500),
      Deal.find().lean().limit(1000),
    ]);

    /* ================= NORMALIZE DEALS ================= */

    const deals = (dealsRaw as DealDoc[]).map((d) => ({
      _id: String(d._id),
      title: safeString(d.title, "Untitled Deal"),
      value: safeNumber(d.value),
      stage: normalizeStage(d.stage),
      probability: safeNumber(d.probability),
      updatedAt: d.updatedAt
        ? new Date(d.updatedAt as string).toISOString() // ✅ FIXED (string)
        : new Date().toISOString(),
    }));

    const alerts = generateAlerts(leadsRaw || [], deals);

    return success(alerts);

  } catch (err) {
    console.error("ALERTS ERROR:", err);
    return error("Failed to generate alerts");
  }
}