// leads.api.ts
//
// Frontend client for bulk lead import.
// Mirrors backend POST /api/leads/bulk (lead.controller.ts -> bulkCreate).
//
// The backend validates each row with createLeadSchema, which uses a STRICT
// source enum (z.nativeEnum(LeadSource)) and does NOT run normalizeLeadSource.
// So we normalize the source to a valid enum value HERE before sending,
// otherwise one bad source value rejects the entire batch.
//
// SMART IMPORT (upgraded):
//  - Reads CSV and Excel (.xlsx/.xls) via SheetJS
//  - Fuzzy header matching (tolerates typos like "hame", variants like
//    "full name", "mobile", "city", "amount", "lead source")
//  - Positional fallback: if a header can't be matched by name, falls
//    back to column order (1st=name, 2nd=phone, ...)

import * as XLSX from "xlsx";
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
  const compact = cleaned.replace(/_/g, "");
  return SOURCE_ALIASES[cleaned] ?? SOURCE_ALIASES[compact] ?? "CSV_IMPORT";
}

// ============================================================
// SMART HEADER MATCHING
// ============================================================
// Map many human header variations to our canonical fields. Matching
// ignores case, spaces, underscores, dashes, dots. This is what makes
// a typo'd header like "hame" or a variant like "Full Name" still work.

const FIELD_ALIASES: Record<string, string[]> = {
  name: [
    "name", "fullname", "contactname", "leadname", "customer",
    "customername", "person", "client", "clientname",
  ],
  phone: [
    "phone", "mobile", "contact", "number", "phonenumber",
    "mobilenumber", "cell", "tel", "telephone", "contactnumber",
  ],
  email: ["email", "mail", "emailaddress", "emailid"],
  budget: [
    "budget", "value", "amount", "price", "dealvalue", "worth",
    "estimate", "cost",
  ],
  interestedLocation: [
    "interestedlocation", "location", "city", "area", "place",
    "region", "address",
  ],
  source: ["source", "channel", "leadsource", "origin", "via"],
};

/** Strip everything but letters/numbers, lowercase. "Full Name " -> "fullname" */
function canon(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Build alias lookup once: canon(alias) -> canonical field */
const ALIAS_LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const field of Object.keys(FIELD_ALIASES)) {
    for (const alias of FIELD_ALIASES[field]) {
      map[canon(alias)] = field;
    }
  }
  return map;
})();

/** Canonical field order — used for positional fallback. */
const FIELD_ORDER = [
  "name",
  "phone",
  "email",
  "budget",
  "interestedLocation",
  "source",
] as const;

/**
 * Decide which column index maps to each field.
 *  1) Match header cells to canonical fields via aliases
 *  2) For unmapped fields, fall back to column order (only filling
 *     columns not already claimed)
 */
function resolveColumns(headerRow: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const claimed = new Set<number>();

  // Pass 1: alias matching
  headerRow.forEach((cell, i) => {
    const field = ALIAS_LOOKUP[canon(cell)];
    if (field && mapping[field] === undefined) {
      mapping[field] = i;
      claimed.add(i);
    }
  });

  // Pass 2: positional fallback for unmapped fields
  let nextCol = 0;
  for (const field of FIELD_ORDER) {
    if (mapping[field] !== undefined) continue;
    while (claimed.has(nextCol)) nextCol++;
    if (nextCol < headerRow.length) {
      mapping[field] = nextCol;
      claimed.add(nextCol);
    }
    nextCol++;
  }

  return mapping;
}

/** Does row 0 look like a header (labels) rather than data? */
function looksLikeHeader(row: string[]): boolean {
  if (row.length === 0) return false;
  return row.some((c) => ALIAS_LOOKUP[canon(c)] !== undefined);
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
// CSV PARSING (kept for backward compatibility)
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

/** Turn a row of string cells into a validated lead, or a skip reason. */
function rowToLead(
  cells: string[],
  cols: Record<string, number>,
  rowNum: number,
  valid: BulkLeadInput[],
  skipped: Array<{ row: number; reason: string }>
): void {
  const get = (field: string) => {
    const idx = cols[field];
    return idx !== undefined && idx >= 0 ? (cells[idx] ?? "").trim() : "";
  };

  const name = get("name");
  const phone = get("phone");
  const emailRaw = get("email");
  const budgetRaw = get("budget");
  const interestedLocation = get("interestedLocation");
  const sourceRaw = get("source");

  if (!name) {
    skipped.push({ row: rowNum, reason: "Missing name" });
    return;
  }
  if (!phone || phone.length < 6) {
    skipped.push({ row: rowNum, reason: "Missing or too-short phone" });
    return;
  }
  if (!interestedLocation) {
    skipped.push({ row: rowNum, reason: "Missing location" });
    return;
  }
  const budget = Number(budgetRaw.replace(/[,\s₹]/g, "").replace(/rs\.?/gi, ""));
  if (!Number.isFinite(budget) || budget < 0) {
    skipped.push({ row: rowNum, reason: "Invalid budget" });
    return;
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

/**
 * Parse + validate a CSV string into ready-to-send leads.
 * Smart: tolerant of header typos and reordered columns via resolveColumns.
 */
export function parseLeadsCsv(csv: string): LeadImportParseResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const valid: BulkLeadInput[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  if (lines.length === 0) return { valid, skipped };

  const allRows = lines.map((l) => splitCsvLine(l).map((c) => c.trim()));

  const hasHeader = looksLikeHeader(allRows[0]);
  const headerRow = hasHeader ? allRows[0] : allRows[0].map(() => "");
  const cols = resolveColumns(headerRow);
  const dataStart = hasHeader ? 1 : 0;

  for (let i = dataStart; i < allRows.length; i++) {
    rowToLead(allRows[i], cols, i + 1, valid, skipped);
  }

  return { valid, skipped };
}

// ============================================================
// SMART FILE PARSING — CSV or Excel (.xlsx/.xls)
// ============================================================

/**
 * Read any supported file into a 2D array of trimmed string cells.
 * SheetJS handles .csv, .xlsx, and .xls uniformly.
 */
async function readFileToRows(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  return rows.map((r) =>
    (Array.isArray(r) ? r : []).map((c) => String(c ?? "").trim())
  );
}

/**
 * Parse a CSV or Excel FILE into ready-to-send leads + skipped report.
 * This is the smart entry point the UI should call.
 */
export async function parseLeadsFile(
  file: File
): Promise<LeadImportParseResult> {
  const valid: BulkLeadInput[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];

  let rows: string[][];
  try {
    rows = await readFileToRows(file);
  } catch {
    return { valid, skipped: [{ row: 0, reason: "Could not read file" }] };
  }

  if (rows.length === 0) return { valid, skipped };

  const hasHeader = looksLikeHeader(rows[0]);
  const headerRow = hasHeader ? rows[0] : rows[0].map(() => "");
  const cols = resolveColumns(headerRow);
  const dataStart = hasHeader ? 1 : 0;

  for (let i = dataStart; i < rows.length; i++) {
    rowToLead(rows[i], cols, i + 1, valid, skipped);
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