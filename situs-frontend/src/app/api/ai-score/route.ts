import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type AIScoreResponse = {
  score: number;
  reasons: string[];
};

type AIScoreBody = {
  value?: unknown;
  probability?: unknown;
};

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Score calculated") {
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
  const fallback: AIScoreResponse = {
    score: 0,
    reasons: [],
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

/* ================= AI LOGIC ================= */

function calculateScore(value: number, probability: number): AIScoreResponse {
  let score = probability;
  const reasons: string[] = [];

  // 🔻 Probability impact
  if (probability < 40) {
    score -= 15;
    reasons.push("Low probability deal");
  } else if (probability < 70) {
    score -= 5;
    reasons.push("Moderate confidence");
  } else {
    reasons.push("High probability deal");
  }

  // 💰 Value impact
  if (value > 100000) {
    score -= 5;
    reasons.push("High value deals move slower");
  }

  if (value > 500000) {
    score -= 5;
    reasons.push("Very large deal risk");
  }

  // 🧠 Normalize
  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    reasons,
  };
}

/* ================= API ================= */

export async function POST(req: Request) {
  try {
    const body: AIScoreBody = await req.json();

    const value = safeNumber(body.value);
    const probability = safeNumber(body.probability);

    /* ================= VALIDATION ================= */

    if (
      typeof body.probability !== "number" ||
      !Number.isFinite(body.probability)
    ) {
      return error("Invalid probability", 400);
    }

    if (probability < 0 || probability > 100) {
      return error("Probability must be between 0 and 100", 400);
    }

    const result = calculateScore(value, probability);

    return success<AIScoreResponse>(result);

  } catch (err) {
    console.error("AI SCORE ERROR:", err);
    return error("AI scoring failed");
  }
}