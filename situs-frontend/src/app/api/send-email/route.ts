import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

/* ================= INIT ================= */

const resend = new Resend(process.env.RESEND_API_KEY);

/* ================= TYPES ================= */

type SendEmailBody = {
  to?: unknown;
  subject?: unknown;
  message?: unknown;
};

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

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeHTML(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ================= API ================= */

export async function POST(req: Request) {
  try {
    const body: SendEmailBody = await req.json();

    const to = safeString(body.to);
    const subject = safeString(body.subject);
    const message = safeString(body.message);

    /* ================= VALIDATION ================= */

    if (!to || !subject || !message) {
      return error("All fields are required", 400);
    }

    if (!isValidEmail(to)) {
      return error("Invalid email address", 400);
    }

    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return error("Email service not configured", 500);
    }

    /* ================= SANITIZE ================= */

    const safeMessage = sanitizeHTML(message);

    /* ================= SEND ================= */

    const result = await resend.emails.send({
      from: "Revenue System <onboarding@resend.dev>",
      to,
      subject,
      html: `<p>${safeMessage}</p>`,
    });

    if (result.error) {
      console.error("RESEND ERROR:", result.error);
      return error("Failed to send email", 400);
    }

    return success("Email sent successfully");

  } catch (err) {
    console.error("SEND EMAIL ERROR:", err);
    return error("Email failed");
  }
}