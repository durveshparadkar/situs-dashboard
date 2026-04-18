import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import Deal from "../../models/deal";

export const dynamic = "force-dynamic";

/* ================= HELPERS ================= */

function success(message: string) {
  return NextResponse.json(
    {
      success: true,
      message,
      data: null,
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

/* ================= SEED DATA ================= */

const seedDeals = [
  {
    title: "Deal A",
    value: 50000,
    probability: 70,
    owner: "John",
    stage: "Leads",
    position: 0,
  },
  {
    title: "Deal B",
    value: 30000,
    probability: 40,
    owner: "Sarah",
    stage: "Qualified",
    position: 0,
  },
  {
    title: "Deal C",
    value: 20000,
    probability: 20,
    owner: "Mike",
    stage: "Proposal",
    position: 0,
  },
  {
    title: "Deal D",
    value: 120000,
    probability: 60,
    owner: "You",
    stage: "Negotiation",
    position: 0,
  },
  {
    title: "Deal E",
    value: 250000,
    probability: 85,
    owner: "You",
    stage: "Won",
    position: 0,
  },
];

/* ================= API ================= */

export async function GET() {
  try {
    await connectDB();

    /* 🔥 PROTECTION: disable in production */
    if (process.env.NODE_ENV === "production") {
      return error("Seeding is disabled in production", 403);
    }

    /* 🔥 RESET DATABASE */

    await Deal.deleteMany({});

    /* 🔥 INSERT DATA */

    await Deal.insertMany(seedDeals);

    return success("Database seeded successfully");

  } catch (err) {
    console.error("SEED ERROR:", err);
    return error("Seeding failed");
  }
}