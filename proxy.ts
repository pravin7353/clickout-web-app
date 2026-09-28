import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user as any;

  // Enforce OTP session scope: only /employee and /employee/* (+ auth endpoints)
  if (user?.authMethod === "otp") {
    const isEmployeeRoute = pathname.startsWith("/employee");
    const isAuthRoute = pathname.startsWith("/api/auth") || pathname === "/login";
    const isStatic =
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api/cron") ||
      pathname === "/favicon.ico" ||
      pathname.includes(".");

    if (!isEmployeeRoute && !isAuthRoute && !isStatic) {
      const url = req.nextUrl.clone();
      url.pathname = "/employee";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
