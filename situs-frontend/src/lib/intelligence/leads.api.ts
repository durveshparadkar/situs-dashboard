// leads.api.ts
//
// Frontend client for bulk lead import.
// Mirrors backend POST /api/leads/bulk (lead.controller.ts -> bulkCreate).
//
// The backend validates each row with createLeadSchema, which uses a STRICT
// source enum (z.nativeEnum(LeadSource)) and does NOT run normalizeLeadSource.
// So we normalize the source to a valid enum value HERE before sending,
// otherwise one bad source value rejects the entire batch.

import { apiFetch } from "../../lib/api";

// ============================================================
// TYPES
// ============================================================

/** Shape the backend createLeadSchema expects per lead. */
export interface BulkLeadInput {
  name: string;
  phone: string;
  email?: string | null;
  budget: number;
  interestedLocation: string;
  source: string; // must be a valid LeadSource enum value
}

/** A row parsed from the CSV before validation/normalization. */
export interface LeadImportRow {
  name?: string;
  phone?: string;
  email?: string;
  budget?: string;
  interestedLocation?: string;
  source?: string;
}

/** Local validation result before sending to the server. */
export interface LeadImportParseResult {
  valid: BulkLeadInput[];
  skipped: Array<{ row: number; reason: string }>;
}

/** Backend bulk response. */
export interface BulkCreateResult {
  created: number;
  failed: number;
}

interface BulkCreateResponse {
  success: boolean;
  data: BulkCreateResult;
  message?: string;
}

// ============================================================
// SOURCE NORMALIZATION (frontend port)
// ============================================================
// Subset of backend normalizeLeadSource aliases — enough to cover
// common human-typed values. Anything unrecognized falls back to
// CSV_IMPORT (a real enum value) so rows never fail on source alone.

const SOURCE_ALIASES: Record<string, string> = {
  // referral
  REFERRAL: "CUSTOMER_REFERRAL",
  REFER: "CUSTOMER_REFERRAL",
  REFERRED: "CUSTOMER_REFERRAL",
  WOM: "WORD_OF_MOUTH",
  // web
  WEB: "WEBSITE",
  SITE: "WEBSITE",
  WEBSITE: "WEBSITE",
  WEB_FORM: "WEBSITE_FORM",
  CONTACT_FORM: "WEBSITE_FORM",
  FORM: "WEBSITE_FORM",
  // ads
  FB: "FACEBOOK_ADS",
  FACEBOOK: "FACEBOOK_ADS",
  META: "FACEBOOK_ADS",
  IG: "INSTAGRAM_ADS",
  INSTAGRAM: "INSTAGRAM_ADS",
  GOOGLE: "GOOGLE_ADS",
  ADWORDS: "GOOGLE_ADS",
  PPC: "GOOGLE_ADS",
  LINKEDIN: "LINKEDIN_ORGANIC",
  YOUTUBE: "YOUTUBE_ADS",
  TWITTER: "TWITTER_ORGANIC",
  X: "TWITTER_ORGANIC",
  // inbound / search
  ORGANIC: "ORGANIC_SEARCH",
  SEO: "ORGANIC_SEARCH",
  SEARCH: "ORGANIC_SEARCH",
  CHAT: "WEBSITE_CHAT",
  // outbound
  EMAIL: "COLD_EMAIL",
  CALL: "COLD_CALL",
  PHONE: "PHONE_INBOUND",
  SDR: "SDR_OUTBOUND",
  BDR: "SDR_OUTBOUND",
  // events
  EVENT: "EVENT",
  TRADESHOW: "TRADE_SHOW",
  EXPO: "EXHIBITION",
  WEBINAR: "WEBINAR",
  CONFERENCE: "CONFERENCE",
  WALKIN: "WALKIN",
  "WALK_IN": "WALKIN",
  "WALK-IN": "WALKIN",
  // real estate portals (India)
  MAGICBRICKS: "MAGICBRICKS",
  MAGIC_BRICKS: "MAGICBRICKS",
  MB: "MAGICBRICKS",
  HOUSING: "HOUSING_COM",
  "99ACRES": "NINETY_NINE_ACRES",
  "99_ACRES": "NINETY_NINE_ACRES",
  NOBROKER: "NO_BROKER",
  "NO_BROKER": "NO_BROKER",
  // import / migration
  IMPORT: "CSV_IMPORT",
  CSV: "CSV_IMPORT",
  MIGRATION: "CRM_MIGRATION",
  HUBSPOT: "CRM_MIGRATION",
  SALESFORCE: "CRM_MIGRATION",
  // manual
  MANUAL: "MANUAL_ENTRY",
  "MANUAL_ENTRY": "MANUAL_ENTRY",
  // partner
  PARTNER: "CHANNEL_PARTNER",
  // catch-all
  OTHER: "OTHER",
  UNKNOWN: "UNKNOWN",
};

/** Valid enum values that pass straight through (the common ones). */
const KNOWN_SOURCES = new Set<string>([
  "WEBSITE", "WEBSITE_FORM", "WEBSITE_CHAT", "ORGANIC_SEARCH",
  "CONTENT_DOWNLOAD", "WEBINAR", "PODCAST",
  "GOOGLE_ADS", "LINKEDIN_ADS", "FACEBOOK_ADS", "INSTAGRAM_ADS",
  "YOUTUBE_ADS", "TWITTER_ADS", "DISPLAY_ADS", "RETARGETING",
  "LINKEDIN_ORGANIC", "TWITTER_ORGANIC", "FACEBOOK_ORGANIC", "INSTAGRAM_ORGANIC",
  "COLD_EMAIL", "COLD_CALL", "COLD_LINKEDIN", "SDR_OUTBOUND",
  "CUSTOMER_REFERRAL", "EMPLOYEE_REFERRAL", "PARTNER_REFERRAL", "WORD_OF_MOUTH",
  "CHANNEL_PARTNER", "RESELLER", "AFFILIATE", "INTEGRATION", "MARKETPLACE",
  "TRADE_SHOW", "CONFERENCE", "EXHIBITION", "EVENT", "MEETUP", "ROADSHOW",
  "WALKIN", "PHONE_INBOUND",
  "PR_MENTION", "PRESS_RELEASE", "REVIEW_SITE", "DIRECTORY",
  "MAGICBRICKS", "HOUSING_COM", "NINETY_NINE_ACRES", "NO_BROKER",
  "PRODUCT_HUNT", "HACKER_NEWS", "THIRD_PARTY",
  "MANUAL_ENTRY", "CSV_IMPORT", "CRM_MIGRATION", "API",
  "OTHER", "UNKNOWN",
]);

/** Normalize a free-text source to a valid LeadSource; default CSV_IMPORT. */
export function normalizeSource(raw?: string): string {
  if (!raw || !raw.trim()) return "CSV_IMPORT";
  const cleaned = raw.trim().toUpperCase().replace(/[-\s.]+/g, "_");
  if (KNOWN_SOURCES.has(cleaned)) return cleaned;
  return SOURCE_ALIASES[cleaned] ?? "CSV_IMPORT";
}

// ============================================================
// TEMPLATE
// ============================================================

export const LEAD_IMPORT_HEADERS = [
  "name",
  "phone",
  "email",
  "budget",
  "interestedLocation",
  "source",
] as const;

/** Downloadable CSV template: header + one example row. */
export function buildLeadImportTemplate(): string {
  const header = LEAD_IMPORT_HEADERS.join(",");
  const example = "Rahul Sharma,9876543210,rahul@example.com,5000000,Andheri Mumbai,referral";
  return header + "\n" + example + "\n";
}

// ============================================================
// CSV PARSING
// ============================================================

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Parse + validate a CSV string into ready-to-send leads.
 * Validates required fields locally so we can show a useful skipped-rows
 * report and never send rows the backend would reject.
 */
export function parseLeadsCsv(csv: string): LeadImportParseResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const valid: BulkLeadInput[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  if (lines.length === 0) return { valid, skipped };

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const idx = {
    name: headers.indexOf("name"),
    phone: headers.indexOf("phone"),
    email: headers.indexOf("email"),
    budget: headers.indexOf("budget"),
    interestedLocation: headers.indexOf("interestedlocation"),
    source: headers.indexOf("source"),
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const rowNum = i + 1; // 1-based, header is row 1

    const get = (n: number) => (n >= 0 ? (cols[n] ?? "").trim() : "");

    const name = get(idx.name);
    const phone = get(idx.phone);
    const emailRaw = get(idx.email);
    const budgetRaw = get(idx.budget);
    const interestedLocation = get(idx.interestedLocation);
    const sourceRaw = get(idx.source);

    // Required: name
    if (!name) {
      skipped.push({ row: rowNum, reason: "Missing name" });
      continue;
    }
    // Required: phone (min 6 chars per schema)
    if (!phone || phone.length < 6) {
      skipped.push({ row: rowNum, reason: "Missing or too-short phone" });
      continue;
    }
    // Required: interestedLocation
    if (!interestedLocation) {
      skipped.push({ row: rowNum, reason: "Missing location" });
      continue;
    }
    // Required: budget (number >= 0)
    const budget = Number(budgetRaw.replace(/[,\s]/g, ""));
    if (!Number.isFinite(budget) || budget < 0) {
      skipped.push({ row: rowNum, reason: "Invalid budget" });
      continue;
    }

    valid.push({
      name,
      phone,
      email: emailRaw ? emailRaw : null,
      budget,
      interestedLocation,
      source: normalizeSource(sourceRaw),
    });
  }

  return { valid, skipped };
}

// ============================================================
// BULK CREATE
// ============================================================

/**
 * POST /api/leads/bulk
 * Body: { leads: BulkLeadInput[] }
 */
export async function bulkCreateLeads(
  leads: BulkLeadInput[]
): Promise<BulkCreateResult> {
  const res = await apiFetch<BulkCreateResponse>("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ leads }),
  });

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Bulk import failed");
  }

  return res.data;
}