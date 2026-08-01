import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

/**
 * User-level fix for company laptops that cannot sync Windows time as admin.
 * Default Clerk skew tolerance (~5s) is too tight when the OS clock drifts.
 */
const CLOCK_SKEW_MS = 15 * 60 * 1000; // 15 minutes

export default clerkMiddleware(
  async (auth, request) => {
    if (isPublicRoute(request)) {
      return NextResponse.next();
    }

    const { userId } = await auth();
    if (!userId) {
      const signIn = new URL("/sign-in", request.url);
      signIn.searchParams.set("redirect_url", request.url);
      return NextResponse.redirect(signIn);
    }

    return NextResponse.next();
  },
  {
    clockSkewInMs: CLOCK_SKEW_MS,
    authorizedParties: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ],
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
