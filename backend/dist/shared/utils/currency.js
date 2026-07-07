export { detectCurrencyFromIp } from "../../utils/currency.js";
const LOCALE_BY_CURRENCY = {
    INR: "en-IN",
    USD: "en-US",
    EUR: "de-DE",
    GBP: "en-GB",
};
export function formatCurrency(amount, currency = "INR") {
    return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
        style: "currency",
        currency,
        maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
}
//# sourceMappingURL=currency.js.map