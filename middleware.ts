import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

// We instantiate the Clerk handler only when env vars are present, so the
// app can boot without auth configured (useful for first-run smoke tests
// before any keys are set up).
const clerkHandler = clerkEnabled ? clerkMiddleware() : null;

export default function middleware(req: NextRequest, ev: any) {
  if (!clerkHandler) return NextResponse.next();
  return clerkHandler(req, ev);
}

export const config = {
  // Skip Next.js internals and static files; run on app routes and APIs.
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp3|ogg|wav|bin)).*)',
    '/(api|trpc)(.*)',
  ],
};
