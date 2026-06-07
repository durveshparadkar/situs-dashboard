import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  console.log("PATH:", req.nextUrl.pathname);
  console.log("TOKEN EXISTS:", !!token);

  const isAuthPage =
    req.nextUrl.pathname === "/login" ||
    req.nextUrl.pathname === "/signup";

  const isDashboard =
    req.nextUrl.pathname.startsWith("/dashboard");

  if (!token && isDashboard) {
    console.log("REDIRECTING TO LOGIN");

    return NextResponse.redirect(
      new URL("/login", req.url)
    );
  }

  if (token && isAuthPage) {
    console.log("REDIRECTING TO DASHBOARD");

    return NextResponse.redirect(
      new URL("/dashboard/alerts", req.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};