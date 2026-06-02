export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const REQUEST_TIMEOUT_MS = Number(
    process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 20000
  );

  const url = `${BASE_URL}${path}`;

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      credentials: "include",
      cache: options.cache ?? "no-store",
      ...options,
      headers: {
        ...(options.body && { "Content-Type": "application/json" }), // ✅ FIX
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";

    let data: unknown = null;

    /* ================= SAFE PARSE ================= */
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();

      console.error("❌ Non-JSON response:", text);

      throw new Error(
        "Server returned invalid response (check API URL)"
      );
    }

    /* ================= HANDLE 429 ================= */
    if (res.status === 429) {
      return {
        success: false,
        message: "Too many requests. Please wait a moment.",
      } as T;
    }

    /* ================= HANDLE ERRORS ================= */
    if (!res.ok) {
      const body = data as {
        message?: unknown;
        error?: {
          message?: unknown;
        };
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
      if (err.name === "AbortError") {
        throw new Error("Request timed out. Try again.");
      }

      if (err.name === "TypeError") {
        throw new Error(
          "Cannot connect to server. Is backend running?"
        );
      }

      throw err;
    }

    throw new Error("Unexpected error");
  }
}
