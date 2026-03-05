import { auth } from "@/auth"
import { NextResponse } from "next/server"

/**
 * Next.js middleware — runs BEFORE route handlers.
 * Blocks unauthenticated access to all protected pages and API routes.
 * Public exceptions: /api/auth/* (NextAuth endpoints) and /api/settings (GET only, public config).
 */
export default auth((req) => {
  const { pathname } = req.nextUrl

  // Allow NextAuth endpoints (sign-in, callback, etc.)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Block unauthenticated requests to all other /api/* routes
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  // Block unauthenticated requests to protected pages
  const isProtectedPage = ["/dashboard", "/admin", "/bracket", "/fixtures"].some((path) =>
    pathname.startsWith(path)
  )
  if (isProtectedPage && !req.auth?.user) {
    return NextResponse.redirect(new URL("/", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/bracket/:path*",
    "/fixtures/:path*",
    "/api/:path*",
  ],
}
