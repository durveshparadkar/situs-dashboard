import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  const isAuthPage =
    req.nextUrl.pathname === "/login" ||
    req.nextUrl.pathname === "/signup";

  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  // ❌ Not logged in → block dashboard
  if (!token && isDashboard) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ✅ Logged in → block login/signup
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard/alerts", req.url));
  }

  return NextResponse.next();
}

// 🔥 Apply only to these routes
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};