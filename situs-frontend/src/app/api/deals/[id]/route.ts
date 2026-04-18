import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "../../../../lib/mongodb";
import Deal from "../../../models/deal";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type Stage = "Leads" | "Qualified" | "Proposal" | "Negotiation" | "Won";

const VALID_STAGES: Stage[] = [
  "Leads",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
];

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Success") {
  return NextResponse.json({ success: true, message, data });
}

function error(message = "Something went wrong", status = 500) {
  return NextResponse.json({ success: false, message }, { status });
}

function isValidObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
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

/* ================= PATCH ================= */

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let session: mongoose.ClientSession | null = null;

  try {
    if (!isValidObjectId(params.id)) {
      return error("Invalid deal ID", 400);
    }

    await connectDB();

    const body = await req.json();
    const { stage, position, title, value } = body;

    session = await mongoose.startSession();
    session.startTransaction();

    const deal = await Deal.findById(params.id).session(session);

    if (!deal) {
      await session.abortTransaction();
      return error("Deal not found", 404);
    }

    const newStage = normalizeStage(stage);
    const newPosition = isValidNumber(position) ? position : deal.position;

    const oldStage = deal.stage;
    const oldPosition = deal.position;

    /* ================= DRAG LOGIC (FIXED) ================= */

    if (
      newStage !== oldStage ||
      newPosition !== oldPosition
    ) {
      // 🔹 REMOVE from old position
      await Deal.updateMany(
        {
          stage: oldStage,
          position: { $gt: oldPosition },
        },
        { $inc: { position: -1 } },
        { session }
      );

      // 🔹 MAKE SPACE in new column
      await Deal.updateMany(
        {
          stage: newStage,
          position: { $gte: newPosition },
        },
        { $inc: { position: 1 } },
        { session }
      );

      deal.stage = newStage;
      deal.position = newPosition;
    }

    /* ================= FIELD UPDATES ================= */

    if (typeof title === "string") {
      deal.title = title.trim();
    }

    if (isValidNumber(value)) {
      deal.value = value;
    }

    await deal.save({ session });

    await session.commitTransaction();

    return success(deal, "Deal updated");
  } catch (err) {
    if (session) await session.abortTransaction();
    console.error("PATCH ERROR:", err);
    return error("Update failed");
  } finally {
    if (session) session.endSession();
  }
}

/* ================= DELETE ================= */

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  let session: mongoose.ClientSession | null = null;

  try {
    if (!isValidObjectId(params.id)) {
      return error("Invalid deal ID", 400);
    }

    await connectDB();

    session = await mongoose.startSession();
    session.startTransaction();

    const deal = await Deal.findById(params.id).session(session);

    if (!deal) {
      await session.abortTransaction();
      return error("Deal not found", 404);
    }

    const stage = deal.stage;
    const position = deal.position;

    await Deal.deleteOne({ _id: params.id }, { session });

    // 🔹 FIX POSITIONS AFTER DELETE
    await Deal.updateMany(
      {
        stage,
        position: { $gt: position },
      },
      { $inc: { position: -1 } },
      { session }
    );

    await session.commitTransaction();

    return success(null, "Deal deleted");
  } catch (err) {
    if (session) await session.abortTransaction();
    console.error("DELETE ERROR:", err);
    return error("Delete failed");
  } finally {
    if (session) session.endSession();
  }
}