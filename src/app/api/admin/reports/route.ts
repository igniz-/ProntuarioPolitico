import { NextResponse } from "next/server";
import { resolveDataReport } from "@/lib/db";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin";

function authorized(request: Request) {
  return isValidAdminSession(request.headers.get("cookie")?.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`))?.[1]);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status === "approved" || body?.status === "rejected" ? body.status : "";
  if (!id || !status) return NextResponse.json({ error: "Invalid report decision." }, { status: 400 });
  try {
    await resolveDataReport(id, status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resolve report." }, { status: 409 });
  }
}