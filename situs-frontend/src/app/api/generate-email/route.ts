import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ================= TYPES ================= */

type GenerateEmailResponse = {
  email: string;
};

/* ================= HELPERS ================= */

function success<T>(data: T, message = "Email generated") {
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
  const fallback: GenerateEmailResponse = { email: "" };

  return NextResponse.json(
    {
      success: false,
      message,
      data: fallback,
    },
    { status }
  );
}

function isValidString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/* ================= EMAIL LOGIC ================= */

function generateEmail(name: string, company: string): string {
  const safeName = safeString(name);
  const safeCompany = safeString(company);

  const greeting = safeName ? `Hi ${safeName},` : "Hi there,";

  let toneLine = "Would you be open to a quick 15-minute demo?";

  if (safeCompany.length > 10) {
    toneLine =
      "I’d love to show how we can support your growing team.";
  }

  return `
${greeting}

I noticed your team at ${safeCompany} exploring revenue intelligence solutions.

${toneLine}

We help teams:
* Close deals faster  
* Identify risks early  
* Improve conversion rates  

Let me know what your schedule looks like.

Best,  
Revenue Team
`.trim();
}

/* ================= API ================= */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = safeString(body.name);
    const company = safeString(body.company);

    /* ================= VALIDATION ================= */

    if (!isValidString(company)) {
      return error("Company is required", 400);
    }

    const email = generateEmail(name, company);

    return success<GenerateEmailResponse>({ email });

  } catch (err) {
    console.error("GENERATE EMAIL ERROR:", err);
    return error("Failed to generate email");
  }
}