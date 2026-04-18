import { NextResponse } from "next/server";
import { connectDB } from "../../../lib/mongodb";
import Deal from "../../models/deal";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type DealType = {
  stage?: string;
  value?: number;
  month?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

/* ================= CONSTANTS ================= */

const STAGES = ["Leads", "Qualified", "Proposal", "Negotiation", "Won"];

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
    {
      success: false,
      message,
      data: null,
    },
    { status }
  );
}

function safeNumber(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function groupBy<T, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const k = String(item[key] ?? "Unknown");
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function getDaysBetween(a?: Date, b?: Date) {
  if (!a || !b) return 0;

  const start = new Date(a).getTime();
  const end = new Date(b).getTime();

  if (isNaN(start) || isNaN(end)) return 0;

  const diff = end - start;

  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
}

/* ================= API ================= */

export async function GET() {
  try {
    await connectDB();

    const deals = await Deal.find({})
      .select("stage value month createdAt updatedAt")
      .lean()
      .limit(1000);

    const safeDeals: DealType[] = Array.isArray(deals) ? deals : [];

    /* ================= GROUP ================= */

    const dealsByStage = groupBy(safeDeals, "stage");

    /* ================= FUNNEL ================= */

    const funnelStages = STAGES.map((stage, i) => {
      const current = dealsByStage[stage] || [];
      const next = dealsByStage[STAGES[i + 1]] || [];

      const conversion =
        STAGES[i + 1] && current.length
          ? (next.length / current.length) * 100
          : null;

      const avgDays =
        current.length > 0
          ? Math.round(
              current.reduce(
                (sum, d) =>
                  sum + getDaysBetween(d.createdAt, d.updatedAt),
                0
              ) / current.length
            )
          : 0;

      const totalValue = current.reduce(
        (sum, d) => sum + safeNumber(d.value),
        0
      );

      return {
        id: stage,
        name: stage,
        deals: current.length,
        conversion: conversion ? Math.round(conversion) : null,
        avgDays,
        totalValue,
      };
    });

    /* ================= SUMMARY ================= */

    const totalRevenue = safeDeals.reduce(
      (s, d) => s + safeNumber(d.value),
      0
    );

    const revenueAtRisk = funnelStages
      .filter((s) => (s.conversion ?? 100) < 50)
      .reduce((s, st) => s + st.totalValue, 0);

    const validConversions = funnelStages.filter(
      (s) => s.conversion !== null
    );

    const avgConversion =
      validConversions.length > 0
        ? validConversions.reduce(
            (sum, s) => sum + safeNumber(s.conversion),
            0
          ) / validConversions.length
        : 0;

    const summary = {
      totalRevenue,
      revenueAtRisk,
      avgConversion: Math.round(avgConversion),
      totalDeals: safeDeals.length,
    };

    /* ================= REVENUE TREND ================= */

    const monthly = groupBy(safeDeals, "month");

    const revenueTrend = Object.entries(monthly)
      .map(([month, items]) => ({
        month,
        revenue: items.reduce(
          (sum, d) => sum + safeNumber(d.value),
          0
        ),
        deals: items.length,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)); // 🔥 sorted

    /* ================= RESPONSE ================= */

    return success({
      summary,
      funnelStages,
      revenueTrend,
      insights: [],
      predictions: [],
      topActions: [],
      performanceSignals: [],
    });

  } catch (err) {
    console.error("Analytics API Error:", err);
    return error("Failed to fetch analytics");
  }
}