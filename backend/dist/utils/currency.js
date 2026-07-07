// currency.ts
//
// Detects a likely currency from the signup request's IP address,
// using geoip-lite (offline country lookup — no external API calls,
// no rate limits, no signup latency). This is only ever a DEFAULT
// suggestion — the signup form lets the user override it via a
// dropdown, since IP-based geolocation is inherently approximate
// (VPNs, mobile carriers, corporate networks, etc. can be wrong).
import geoip from "geoip-lite";
const COUNTRY_TO_CURRENCY = {
    IN: "INR",
    US: "USD",
    GB: "GBP",
    // Eurozone countries
    DE: "EUR",
    FR: "EUR",
    ES: "EUR",
    IT: "EUR",
    NL: "EUR",
    IE: "EUR",
    PT: "EUR",
    BE: "EUR",
    AT: "EUR",
    FI: "EUR",
    GR: "EUR",
};
/**
 * Returns a best-guess currency based on the request's IP.
 * Falls back to INR (Situs's primary market) if lookup fails or
 * the country isn't in our supported currency list.
 */
export function detectCurrencyFromIp(ip) {
    if (!ip)
        return "INR";
    // Strip IPv6-mapped IPv4 prefix (common behind proxies/load balancers)
    const cleanIp = ip.replace(/^::ffff:/, "");
    try {
        const geo = geoip.lookup(cleanIp);
        const country = geo?.country;
        if (country && COUNTRY_TO_CURRENCY[country]) {
            return COUNTRY_TO_CURRENCY[country];
        }
    }
    catch {
        // Swallow lookup errors — this is a best-effort default, never
        // something that should block or fail signup.
    }
    return "INR";
}
//# sourceMappingURL=currency.js.map