import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import Lead from "../../models/lead";

export const dynamic = "force-dynamic"; // 🔥 fixes caching issue

/* ================= TYPES ================= */

type LeadStatus = "new" | "contacted" | "qualified" | "converted";

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Success") {
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
    { success: false, message, data: [] },
    { status }
  );
}

function isValidString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeNumber(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function isValidStatus(s: unknown): s is LeadStatus {
  return ["new", "contacted", "qualified", "converted"].includes(
    String(s)
  );
}

/* ================= GET ================= */

export async function GET() {
  try {
    await connectDB();

    const leads = await Lead.find()
      .sort({ createdAt: -1 })
      .lean();

    return success(leads, "Leads fetched");
  } catch (err) {
    console.error("GET /leads error:", err);
    return error("Failed to fetch leads");
  }
}

/* ================= POST ================= */

export async function POST(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    if (!isValidString(body.name) || !isValidString(body.company)) {
      return error("Name and company are required", 400);
    }

    const newLead = await Lead.create({
      name: body.name.trim(),
      email: isValidString(body.email) ? body.email.trim() : undefined,
      company: body.company.trim(),
      value: safeNumber(body.value),
      status: "new",
    });

    return success(newLead, "Lead created");
  } catch (err) {
    console.error("POST /leads error:", err);
    return error("Failed to create lead");
  }
}

/* ================= PATCH ================= */

export async function PATCH(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    if (!isValidString(body.id)) {
      return error("Invalid ID", 400);
    }

    const lead = await Lead.findById(body.id);

    if (!lead) {
      return error("Lead not found", 404);
    }

    /* 🔒 SAFE FIELD UPDATE */

    if (isValidString(body.name)) lead.name = body.name.trim();
    if (isValidString(body.email)) lead.email = body.email.trim();
    if (isValidString(body.company)) lead.company = body.company.trim();

    if (body.value !== undefined) {
      lead.value = safeNumber(body.value);
    }

    if (isValidStatus(body.status)) {
      lead.status = body.status;
    }

    await lead.save();

    return success(lead, "Lead updated");
  } catch (err) {
    console.error("PATCH /leads error:", err);
    return error("Failed to update lead");
  }
}

/* ================= DELETE ================= */

export async function DELETE(req: Request) {
  try {
    await connectDB();

    const body = await req.json();

    if (!isValidString(body.id)) {
      return error("Invalid ID", 400);
    }

    const lead = await Lead.findById(body.id);

    if (!lead) {
      return error("Lead not found", 404);
    }

    await Lead.deleteOne({ _id: body.id });

    return success(null, "Lead deleted");
  } catch (err) {
    console.error("DELETE /leads error:", err);
    return error("Failed to delete lead");
  }
}