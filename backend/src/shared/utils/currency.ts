import type { OrganizationCurrency } from "../../modules/organizations/organization.model.js";

export { detectCurrencyFromIp } from "../../utils/currency.js";
export type { OrganizationCurrency };

const LOCALE_BY_CURRENCY: Record<OrganizationCurrency, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
};

export function formatCurrency(
  amount: number,
  currency: OrganizationCurrency = "INR"
): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
