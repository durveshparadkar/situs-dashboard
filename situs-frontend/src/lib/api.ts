/**
 * apiFetch — resilient API client.
 *
 * Handles the Render free-tier "cold start" gracefully: when the backend
 * has spun down due to inactivity, the first request can take ~50 seconds
 * while the server wakes up. Instead of failing with a timeout, we use a
 * long timeout and auto-retry transient network/timeout errors so the
 * user just sees a slightly slow first load, never an error.
 */

/* How long to wait on a single attempt. Must exceed Render's ~50s wake-up. */
const REQUEST_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 75000
);

/* How many times to retry on a transient (timeout / network) failure.
   3 attempts total = first try + 2 retries. */
const MAX_RETRIES = 2;

/* Wait between retries (server may still be finishing its boot). */
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  /**
   * BASE_URL strategy:
   *   - In the browser → call the API host directly.
   *   - On the server (SSR / server actions) → use NEXT_PUBLIC_API_URL or
   *     localhost:5000 in dev.
   */
  const isBrowser = typeof window !== "undefined";

  const BASE_URL = isBrowser
    ? "https://api.situsrevenue.com"
    : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000");

  const url = `${BASE_URL}${path}`;

  /* Track the last transient error so we can surface a good message if
     every retry is exhausted. */
  let lastTransientError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, {
          credentials: "include",
          cache: options.cache ?? "no-store",
          ...options,
          headers: {
            ...(options.body && { "Content-Type": "application/json" }),
            ...(options.headers || {}),
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const contentType = res.headers.get("content-type") || "";

      let data: unknown = null;

      /* ================= SAFE PARSE ================= */
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();

        /* A non-JSON body during a cold start is often an HTML error /
           proxy page while the server boots. Treat it as transient and
           retry rather than failing outright. */
        if (attempt < MAX_RETRIES && (res.status === 502 || res.status === 503 || res.status === 504)) {
          lastTransientError = new Error("Server waking up...");
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        console.error("Non-JSON response:", text);
        throw new Error("Server returned invalid response (check API URL)");
      }

      /* ================= HANDLE 429 ================= */
      if (res.status === 429) {
        return {
          success: false,
          message: "Too many requests. Please wait a moment.",
        } as T;
      }

      /* ================= GATEWAY / WAKE-UP ERRORS ================= */
      /* 502/503/504 from the proxy mean the backend is still booting.
         Retry instead of erroring. */
      if (
        (res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt < MAX_RETRIES
      ) {
        lastTransientError = new Error("Server waking up...");
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      /* ================= HANDLE OTHER ERRORS ================= */
      if (!res.ok) {
        const body = data as {
          message?: unknown;
          error?: { message?: unknown };
        } | null;

        const message =
          typeof body?.message === "string"
            ? body.message
            : typeof body?.error?.message === "string"
              ? body.error.message
              : `Request failed (${res.status})`;

        throw new Error(message);
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof Error) {
        /* Transient failures — timeout (AbortError) or network drop
           (TypeError from fetch). These are exactly what a cold start
           looks like, so retry them. */
        const isTransient =
          err.name === "AbortError" || err.name === "TypeError";

        if (isTransient && attempt < MAX_RETRIES) {
          lastTransientError = err;
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        if (err.name === "AbortError") {
          throw new Error(
            "The server is taking longer than usual to respond. Please try again in a moment."
          );
        }

        if (err.name === "TypeError") {
          throw new Error(
            "Cannot connect to the server. Please try again in a moment."
          );
        }

        throw err;
      }

      throw new Error("Unexpected error");
    }
  }

  /* All retries exhausted on transient errors. */
  throw new Error(
    lastTransientError
      ? "The server is waking up and took too long. Please try logging in again."
      : "Unexpected error"
  );
}
