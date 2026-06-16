// deals.api.ts
//
// Frontend client for the backend Deals API.
// Wraps apiFetch with typed endpoints mirroring backend deal.routes.ts.
//
// All endpoints below mirror:
//   backend/src/modules/deals/deal.routes.ts
//
// Auth: cookie-based session via apiFetch (credentials: "include")
//
// SMART IMPORT (upgraded):
//  - Reads CSV and Excel (.xlsx/.xls) via SheetJS
//  - Fuzzy header matching (tolerates typos, variants like "deal name",
//    "amount", "win %")
//  - Positional fallback: if a header can't be matched by name, uses
//    column order (1st=title, 2nd=value, 3rd=probability)

import * as XLSX from "xlsx";
import { apiFetch } from "../../lib/api";

// ============================================================
// TYPES
// ============================================================

export interface BackendDeal {
  _id:                string;
  title:              string;
  description?:       string;
  value:              number;
  currency:           string;
  probability:        number;
  pipelineId:         string;
  stageId:            string;
  status:             "open" | "won" | "lost" | "stalled" | "abandoned";
  priority?:          "low" | "medium" | "high" | "urgent";
  source?:            string;
  expectedCloseDate?: string | null;
  riskScore?:         number;
  riskLevel?:         "low" | "medium" | "high" | "critical";
  lastActivityAt?:    string | null;
  daysInCurrentStage?: number;
  ageDays?:           number;
  organizationId:     string;
  createdAt:          string;
  updatedAt:          string;
}

export interface BackendPipelineStage {
  _id:         string;
  name:        string;
  order:       number;
  probability: number;
  isClosed?:   boolean;
  isWon?:      boolean;
  isLost?:     boolean;
}

export interface BackendPipeline {
  _id:        string;
  name:       string;
  isDefault?: boolean;
  stages:     BackendPipelineStage[];
}

export interface DealListResponse {
  success: boolean;
  data:    BackendDeal[];
  pagination?: {
    page:       number;
    limit:      number;
    total:      number;
    totalPages: number;
    hasNext:    boolean;
    hasPrev:    boolean;
  };
}

export interface DealResponse {
  success: boolean;
  data:    BackendDeal;
  message?: string;
}

export interface PipelineListResponse {
  success: boolean;
  data:    BackendPipeline[];
}

// ============================================================
// IMPORT TYPES
// ============================================================

/** A single parsed CSV row (string values, validated on the backend). */
export interface ImportRow {
  title?:       string;
  value?:       string;
  probability?: string;
}

/** Result of a bulk import, returned by the backend. */
export interface ImportResult {
  imported:    number;
  skipped:     number;
  skippedRows: Array<{ row: number; reason: string }>;
}

export interface ImportResponse {
  success:  boolean;
  data:     ImportResult;
  message?: string;
}

// ============================================================
// PIPELINES
// ============================================================

/**
 * Cached default pipeline. Avoids fetching pipelines on every drawer open.
 * Cleared when the user logs out (page reload).
 */
let cachedDefaultPipeline: BackendPipeline | null = null;

/**
 * Fetch the org's default pipeline for UI surfaces that need stages.
 * Deal creation is handled server-side when no pipeline is supplied.
 */
export async function getDefaultPipeline(): Promise<BackendPipeline | null> {
  if (cachedDefaultPipeline) return cachedDefaultPipeline;

  try {
    const res = await apiFetch<PipelineListResponse>("/api/pipelines");
    if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
      return null;
    }

    /* Prefer default pipeline; fall back to first */
    const def = res.data.find((p) => p.isDefault) ?? res.data[0];
    cachedDefaultPipeline = def;
    return def;
  } catch {
    return null;
  }
}

/**
 * Clear the cached default pipeline. Call after pipeline edits or logout.
 */
export function clearPipelineCache(): void {
  cachedDefaultPipeline = null;
}

// ============================================================
// DEALS — list / get / create / update / delete
// ============================================================

/**
 * GET /api/deals
 * Returns paginated list of deals scoped to the user's organization.
 */
export async function listDeals(params?: {
  page?:   number;
  limit?:  number;
  search?: string;
  stage?:  string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<DealListResponse> {
  const query = new URLSearchParams();
  if (params?.page)      query.set("page",      String(params.page));
  if (params?.limit)     query.set("limit",     String(params.limit));
  if (params?.search)    query.set("search",    params.search);
  if (params?.stage)     query.set("stage",     params.stage);
  if (params?.status)    query.set("status",    params.status);
  if (params?.sortBy)    query.set("sortBy",    params.sortBy);
  if (params?.sortOrder) query.set("sortOrder", params.sortOrder);

  const qs = query.toString();
  const path = "/api/deals" + (qs ? "?" + qs : "");

  return apiFetch<DealListResponse>(path);
}

/**
 * POST /api/deals
 * Create a deal. If pipelineId/stageId are omitted, the backend resolves the
 * org default pipeline or creates the standard starter pipeline.
 */
export async function createDeal(input: {
  title:        string;
  value:        number;
  probability?: number;
  pipelineId?:  string;
  stageId?:     string;
}): Promise<BackendDeal> {
  const body = {
    title:       input.title,
    value:       input.value,
    probability: input.probability,
    ...(input.pipelineId && { pipelineId: input.pipelineId }),
    ...(input.stageId && { stageId: input.stageId }),
  };

  const res = await apiFetch<DealResponse>("/api/deals", {
    method: "POST",
    body:   JSON.stringify(body),
  });

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Failed to create deal");
  }

  return res.data;
}

/**
 * PATCH /api/deals/:id
 * Update an existing deal.
 */
export async function updateDeal(
  dealId: string,
  input:  Partial<{
    title:       string;
    value:       number;
    probability: number;
    stageId:     string;
    status:      string;
  }>
): Promise<BackendDeal> {
  const res = await apiFetch<DealResponse>("/api/deals/" + dealId, {
    method: "PATCH",
    body:   JSON.stringify(input),
  });

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Failed to update deal");
  }
  return res.data;
}

/**
 * DELETE /api/deals/:id
 * Soft delete.
 */
export async function deleteDeal(dealId: string): Promise<void> {
  await apiFetch<{ success: boolean; message?: string }>(
    "/api/deals/" + dealId,
    { method: "DELETE" }
  );
}

// ============================================================
// SMART HEADER MATCHING
// ============================================================
// Map human header variations to canonical fields. Matching ignores
// case, spaces, underscores, dashes, dots — so "Deal Name", "amount",
// "win %", or a typo still map correctly.

const FIELD_ALIASES: Record<string, string[]> = {
  title: [
    "title", "deal", "dealname", "name", "dealtitle", "opportunity",
    "account", "company", "client", "project",
  ],
  value: [
    "value", "amount", "dealvalue", "price", "revenue", "worth",
    "size", "dealsize", "budget",
  ],
  probability: [
    "probability", "prob", "win", "winprobability", "winpercent",
    "winrate", "likelihood", "confidence", "percent", "chance",
  ],
};

/** Strip everything but letters/numbers, lowercase. "Deal Name " -> "dealname" */
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
const FIELD_ORDER = ["title", "value", "probability"] as const;

/**
 * Decide which column index maps to each field.
 *  1) Match header cells to canonical fields via aliases
 *  2) For unmapped fields, fall back to column order
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

  // Pass 2: positional fallback
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
// IMPORT — bulk create from CSV / Excel
// ============================================================

/** The exact column headers the import template uses. */
export const IMPORT_TEMPLATE_HEADERS = [
  "title",
  "value",
  "probability",
] as const;

/**
 * Build a downloadable CSV template string: header row + one example row.
 * Users download this, fill it with their deals, and upload it back.
 */
export function buildImportTemplate(): string {
  const header = IMPORT_TEMPLATE_HEADERS.join(",");
  const example = "Acme Corp Renewal,500000,70";
  return header + "\n" + example + "\n";
}

/**
 * Split a single CSV line into fields, respecting double-quoted values
 * (so a comma inside "ACME, Inc." doesn't break the row).
 */
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

/** Turn a row of cells into an ImportRow using the resolved columns. */
function rowToImportRow(
  cells: string[],
  cols: Record<string, number>
): ImportRow {
  const get = (field: string) => {
    const idx = cols[field];
    return idx !== undefined && idx >= 0 ? (cells[idx] ?? "").trim() : "";
  };
  return {
    title: get("title"),
    value: get("value"),
    probability: get("probability"),
  };
}

/** Is this row completely empty (all cells blank)? */
function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => !c || !c.trim());
}

/**
 * Parse a CSV string into ImportRows. Smart header matching + positional
 * fallback; skips fully-blank rows so they don't become empty-title rows.
 */
export function parseDealsCsv(csv: string): ImportRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const allRows = lines.map((l) => splitCsvLine(l).map((c) => c.trim()));

  const hasHeader = looksLikeHeader(allRows[0]);
  const headerRow = hasHeader ? allRows[0] : allRows[0].map(() => "");
  const cols = resolveColumns(headerRow);
  const dataStart = hasHeader ? 1 : 0;

  const rows: ImportRow[] = [];
  for (let i = dataStart; i < allRows.length; i++) {
    if (isBlankRow(allRows[i])) continue;
    rows.push(rowToImportRow(allRows[i], cols));
  }

  return rows;
}

// ============================================================
// SMART FILE PARSING — CSV or Excel (.xlsx/.xls)
// ============================================================

/** Read any supported file into a 2D array of trimmed string cells. */
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
 * Parse a CSV or Excel FILE into ImportRows.
 * Smart entry point the UI should call for file uploads.
 */
export async function parseDealsFile(file: File): Promise<ImportRow[]> {
  let rows: string[][];
  try {
    rows = await readFileToRows(file);
  } catch {
    return [];
  }

  if (rows.length === 0) return [];

  const hasHeader = looksLikeHeader(rows[0]);
  const headerRow = hasHeader ? rows[0] : rows[0].map(() => "");
  const cols = resolveColumns(headerRow);
  const dataStart = hasHeader ? 1 : 0;

  const out: ImportRow[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    if (isBlankRow(rows[i])) continue;
    out.push(rowToImportRow(rows[i], cols));
  }

  return out;
}

/**
 * POST /api/deals/import
 * Send parsed rows to the backend for bulk creation. Returns the
 * import summary (how many imported, how many skipped and why).
 */
export async function importDeals(rows: ImportRow[]): Promise<ImportResult> {
  const res = await apiFetch<ImportResponse>("/api/deals/import", {
    method: "POST",
    body:   JSON.stringify({ rows }),
  });

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Import failed");
  }

  return res.data;
}
