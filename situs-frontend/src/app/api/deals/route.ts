import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import Deal from "../../models/deal";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type Stage = "Leads" | "Qualified" | "Proposal" | "Negotiation" | "Won";

type DealType = {
  _id?: string;
  title: string;
  value: number;
  probability?: number;
  owner?: string;
  stage: Stage;
  position?: number;
};

/* ================= CONSTANTS ================= */

const VALID_STAGES: Stage[] = [
  "Leads",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
];

const STAGE_ORDER: Record<Stage, number> = {
  Leads: 0,
  Qualified: 1,
  Proposal: 2,
  Negotiation: 3,
  Won: 4,
};

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Success") {
  return NextResponse.json(
    { success: true, message, data },
    { status: 200 }
  );
}

function error(message = "Something went wrong", status = 500) {
  return NextResponse.json(
    { success: false, message, data: null },
    { status }
  );
}

function isValidNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function normalizeStage(stage: unknown): Stage {
  if (typeof stage !== "string") return "Leads";

  const found = VALID_STAGES.find(
    (s) => s.toLowerCase() === stage.toLowerCase()
  );

  return found ?? "Leads";
}

/* ================= GET ================= */

export async function GET() {
  try {
    await connectDB();

    const deals = await Deal.find().lean<DealType[]>();

    // ✅ SAFE SORT (NO CRASHES)
    deals.sort((a, b) => {
      const aStage = normalizeStage(a.stage);
      const bStage = normalizeStage(b.stage);

      const stageDiff =
        (STAGE_ORDER[aStage] ?? 0) - (STAGE_ORDER[bStage] ?? 0);

      if (stageDiff !== 0) return stageDiff;

      return (a.position ?? 0) - (b.position ?? 0);
    });

    return success(deals);
  } catch (err) {
    console.error("GET DEALS ERROR:", err);
    return error("Failed to fetch deals");
  }
}

/* ================= POST ================= */

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    /* ---------- VALIDATION ---------- */

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    if (!title) {
      return error("Title is required", 400);
    }

    const value = isValidNumber(body.value) ? body.value : 0;

    const probability = isValidNumber(body.probability)
      ? body.probability
      : 0;

    const owner =
      typeof body.owner === "string" && body.owner.trim()
        ? body.owner
        : "You";

    const stage = normalizeStage(body.stage);

    /* ---------- POSITION LOGIC ---------- */

    const lastDeal = await Deal.findOne({ stage })
      .sort({ position: -1 })
      .lean<DealType | null>();

    const position = lastDeal
      ? (lastDeal.position ?? 0) + 1
      : 0;

    /* ---------- CREATE ---------- */

    const deal = await Deal.create({
      title,
      value,
      probability,
      owner,
      stage,
      position,
    });

    return success(deal, "Deal created");
  } catch (err: unknown) {
    console.error("POST DEAL ERROR:", err);

    const message =
      err instanceof Error
        ? err.message
        : "Failed to create deal";

    return error(message);
  }
}