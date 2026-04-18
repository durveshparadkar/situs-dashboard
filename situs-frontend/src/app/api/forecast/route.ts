import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import Deal from "../../models/deal";

/* ================= TYPES ================= */

type DealType = {
  _id: string;
  title: string;
  value: number;
  probability: number;
  owner: string;
};

type ForecastSummary = {
  weightedForecast: number;
  totalPipelineValue: number;
};

type ForecastResponse = {
  deals: DealType[];
  summary: ForecastSummary;
};

type DealDoc = {
  _id: unknown;
  title?: unknown;
  value?: unknown;
  probability?: unknown;
  owner?: unknown;
};

/* ================= HELPERS ================= */

function success<T>(data: T) {
  return NextResponse.json({
    success: true,
    data,
  });
}

function error(message = "Something went wrong", status = 500) {
  const fallback: ForecastResponse = {
    deals: [],
    summary: {
      weightedForecast: 0,
      totalPipelineValue: 0,
    },
  };

  return NextResponse.json(
    {
      success: false,
      message,
      data: fallback,
    },
    { status }
  );
}

function safeNumber(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function safeString(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v : fallback;
}

/* ================= LOGIC ================= */

function calculateSummary(deals: DealType[]): ForecastSummary {
  const totalPipelineValue = deals.reduce((sum, deal) => sum + deal.value, 0);

  const weightedForecast = deals.reduce(
    (sum, deal) => sum + (deal.value * deal.probability) / 100,
    0
  );

  return {
    weightedForecast,
    totalPipelineValue,
  };
}

/* ================= API ================= */

export async function GET() {
  try {
    await connectDB();

    const dealsFromDB = await Deal.find()
      .select("title value probability owner")
      .lean();

    const deals: DealType[] = (dealsFromDB as DealDoc[]).map((d) => ({
      _id: String(d._id),
      title: safeString(d.title, "Untitled"),
      value: safeNumber(d.value),
      probability: safeNumber(d.probability),
      owner: safeString(d.owner, "User"),
    }));

    const summary = calculateSummary(deals);

    return success<ForecastResponse>({
      deals,
      summary,
    });

  } catch (err) {
    console.error("FORECAST API ERROR:", err);
    return error("Failed to fetch forecast data");
  }
}