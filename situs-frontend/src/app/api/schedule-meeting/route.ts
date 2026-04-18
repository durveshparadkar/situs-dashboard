import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type LeadInput = {
  _id?: unknown;
  name?: unknown;
  company?: unknown;
};

type ScheduleMeetingBody = {
  date?: unknown;
  time?: unknown;
  lead?: LeadInput;
};

/* ================= MODEL ================= */

const MeetingSchema = new mongoose.Schema(
  {
    leadId: { type: String, required: true },
    leadName: { type: String },
    company: { type: String },
    date: { type: String, required: true },
    time: { type: String, required: true },
  },
  { timestamps: true }
);

const Meeting =
  mongoose.models.Meeting ||
  mongoose.model("Meeting", MeetingSchema);

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Meeting scheduled") {
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
    {
      success: false,
      message,
      data: null,
    },
    { status }
  );
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isValidString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/* ================= API ================= */

export async function POST(req: Request) {
  try {
    await connectDB();

    const body: ScheduleMeetingBody = await req.json();

    const date = safeString(body.date);
    const time = safeString(body.time);
    const lead = body.lead;

    /* ================= VALIDATION ================= */

    if (!isValidString(date) || !isValidString(time)) {
      return error("Date and time are required", 400);
    }

    if (!lead || !isValidString(lead._id)) {
      return error("Invalid lead", 400);
    }

    /* ================= DATE CHECK ================= */

    const meetingDate = new Date(`${date}T${time}`);

    if (isNaN(meetingDate.getTime())) {
      return error("Invalid date/time format", 400);
    }

    if (meetingDate < new Date()) {
      return error("Cannot schedule meeting in the past", 400);
    }

    /* ================= SAVE ================= */

    const meeting = await Meeting.create({
      leadId: String(lead._id),
      leadName: safeString(lead.name),
      company: safeString(lead.company),
      date,
      time,
    });

    return success(meeting);

  } catch (err) {
    console.error("SCHEDULE MEETING ERROR:", err);
    return error("Failed to schedule meeting");
  }
}