// deals.api.ts
//
// Frontend client for the backend Deals API.
// Wraps apiFetch with typed endpoints mirroring backend deal.routes.ts.
//
// All endpoints below mirror:
//   backend/src/modules/deals/deal.routes.ts
//
// Auth: cookie-based session via apiFetch (credentials: "include")

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
// IMPORT — bulk create from CSV
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

/**
 * Parse a CSV string into row objects keyed by the template headers.
 * Reads the header row to find which column is title/value/probability,
 * so column order in the user's file doesn't have to be exact.
 */
export function parseDealsCsv(csv: string): ImportRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const titleIdx = headers.indexOf("title");
  const valueIdx = headers.indexOf("value");
  const probIdx  = headers.indexOf("probability");

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: ImportRow = {};
    if (titleIdx >= 0) row.title = (cols[titleIdx] ?? "").trim();
    if (valueIdx >= 0) row.value = (cols[valueIdx] ?? "").trim();
    if (probIdx  >= 0) row.probability = (cols[probIdx] ?? "").trim();
    rows.push(row);
  }

  return rows;
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
