import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession, hasAdminConfiguration, isValidAdminToken } from "@/lib/admin";

export async function POST(request: Request) {
  if (!hasAdminConfiguration()) return NextResponse.json({ error: "Admin access is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isValidAdminToken(body?.token)) return NextResponse.json({ error: "Invalid admin token." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminSession(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return response;
}