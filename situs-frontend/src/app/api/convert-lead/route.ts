import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import Deal from "../../models/deal";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type LeadInput = {
  company?: unknown;
  value?: unknown;
};

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Lead converted") {
  return NextResponse.json(
    {
      success: true,
      message,
      data,
    },
    { status: 200 }
  );
}

function error(message = "Something went wrong", status = 500) {
  return NextResponse.json(
    { success: false, message, data: null },
    { status }
  );
}

function isValidString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeNumber(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/* ================= API ================= */

export async function POST(req: Request) {
  let session: mongoose.ClientSession | null = null;

  try {
    await connectDB();

    const body = await req.json();
    const lead: LeadInput = body?.lead;

    /* ================= VALIDATION ================= */

    if (!lead || !isValidString(lead.company)) {
      return error("Invalid lead data", 400);
    }

    const title = lead.company.trim();
    const value = safeNumber(lead.value);

    /* ================= TRANSACTION ================= */

    session = await mongoose.startSession();
    session.startTransaction();

    const lastDeal = await Deal.findOne({ stage: "Leads" })
      .sort({ position: -1 })
      .session(session);

    const position = lastDeal ? lastDeal.position + 1 : 0;

    const [newDeal] = await Deal.create(
      [
        {
          title,
          value,
          probability: 10,
          owner: "You",
          stage: "Leads",
          position,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return success(newDeal);

  } catch (err) {
    if (session) await session.abortTransaction();
    console.error("CONVERT LEAD ERROR:", err);
    return error("Failed to convert lead");
  } finally {
    if (session) session.endSession();
  }
}