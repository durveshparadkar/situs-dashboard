// currency.ts
//
// Single source of truth for currency formatting on the frontend.
// Mirrors the backend's shared/utils/currency.ts formatCurrency logic,
// so a Rs.12.5L deal value looks the same whether the AI engine wrote it
// into a reasoning string or the dashboard rendered it directly.
//
// useOrgCurrency() currently returns a hardcoded "INR" default - there
// is no frontend endpoint yet that exposes the logged-in user's
// organization.settings.currency. This is intentional scaffolding:
// every component should call useOrgCurrency() instead of hardcoding
// "INR" directly, so that once a real endpoint exists, updating THIS
// one function is the only change needed anywhere in the app.
//
// TODO: once an endpoint exposing organization.settings.currency exists
// (e.g. GET /api/organizations/me or included in GET /api/auth/me),
// replace the hardcoded return below with a real fetch + cache.

export type OrgCurrency = "INR" | "USD" | "EUR" | "GBP";

const CURRENCY_SYMBOLS: Record<OrgCurrency, string> = {
  INR: "\u20b9",
  USD: "$",
  EUR: "\u20ac",
  GBP: "\u00a3",
};

/**
 * Format a money value for display. INR uses Lakh/Crore; other
 * currencies use standard K/M suffixes.
 *
 * formatCurrency(1250000, "INR") -> "Rs.12.5L"
 * formatCurrency(1250000, "USD") -> "$1.3M"
 */
export function formatCurrency(
  value: number,
  currency: OrgCurrency = "INR"
): string {
  const symbol = CURRENCY_SYMBOLS[currency];

  if (currency === "INR") {
    if (value >= 10_000_000) {
      return `${symbol}${(value / 10_000_000).toFixed(1)}Cr`;
    }

    if (value >= 100_000) {
      return `${symbol}${(value / 100_000).toFixed(1)}L`;
    }

    return `${symbol}${value.toLocaleString("en-IN")}`;
  }

  if (value >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${symbol}${(value / 1_000).toFixed(1)}K`;
  }

  return `${symbol}${value.toLocaleString("en-US")}`;
}

/**
 * Returns the current org's currency. Hardcoded to "INR" until a
 * backend endpoint exposes it - see TODO above. Using this hook
 * everywhere (instead of hardcoding "INR" per-component) means that
 * TODO only needs solving once.
 */
export function useOrgCurrency(): OrgCurrency {
  return "INR";
}
