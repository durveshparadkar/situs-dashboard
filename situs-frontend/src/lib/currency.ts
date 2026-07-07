// currency.ts
//
// Single source of truth for currency formatting on the frontend.
// Mirrors the backend's shared/utils/currency.ts formatCurrency logic,
// so a ₹12.5L deal value looks the same whether the AI engine wrote it
// into a reasoning string or the dashboard rendered it directly.
//
// useOrgCurrency() fetches the logged-in user's organization.currency
// from GET /api/auth/me (auth.service.ts's getProfile now includes it)
// and caches it for the session so we don't refetch on every render.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type OrgCurrency = "INR" | "USD" | "EUR" | "GBP";

const CURRENCY_SYMBOLS: Record<OrgCurrency, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

const VALID_CURRENCIES: readonly OrgCurrency[] = ["INR", "USD", "EUR", "GBP"];

function isOrgCurrency(value: unknown): value is OrgCurrency {
  return typeof value === "string" && (VALID_CURRENCIES as readonly string[]).includes(value);
}

export function formatCurrency(
  value: number,
  currency: OrgCurrency = "INR"
): string {
  const symbol = CURRENCY_SYMBOLS[currency];

  if (currency === "INR") {
    if (value >= 10_000_000) return `${symbol}${(value / 10_000_000).toFixed(1)}Cr`;
    if (value >= 100_000) return `${symbol}${(value / 100_000).toFixed(1)}L`;
    return `${symbol}${value.toLocaleString("en-IN")}`;
  }

  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}K`;
  return `${symbol}${value.toLocaleString("en-US")}`;
}

let cachedCurrency: OrgCurrency | null = null;
let inFlightFetch: Promise<OrgCurrency> | null = null;

async function fetchOrgCurrency(): Promise<OrgCurrency> {
  if (cachedCurrency) return cachedCurrency;
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: { organization?: { currency?: string } };
      }>("/api/auth/me");

      const currency = res?.data?.organization?.currency;
      cachedCurrency = isOrgCurrency(currency) ? currency : "INR";
      return cachedCurrency;
    } catch {
      cachedCurrency = "INR";
      return cachedCurrency;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

export function useOrgCurrency(): OrgCurrency {
  const [currency, setCurrency] = useState<OrgCurrency>(cachedCurrency ?? "INR");

  useEffect(() => {
    let cancelled = false;

    fetchOrgCurrency().then((c) => {
      if (!cancelled) setCurrency(c);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return currency;
}

export function invalidateOrgCurrencyCache(): void {
  cachedCurrency = null;
  inFlightFetch = null;
}
