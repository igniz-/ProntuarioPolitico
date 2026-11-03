import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/db";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin";

export async function GET(request: Request) {
  if (!isValidAdminSession(request.headers.get("cookie")?.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`))?.[1])) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await getAnalyticsSummary());
}