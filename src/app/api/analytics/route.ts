import { NextResponse } from "next/server";
import { hashVisitor, recordAnalyticsEvent } from "@/lib/db";

const eventTypes = ["page_view", "share_copy", "session_end"] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const eventType = body.eventType;
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const path = typeof body.path === "string" ? body.path.slice(0, 300) : "/";
    const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : 0;
    if (!eventTypes.includes(eventType as typeof eventTypes[number]) || !eventId || !sessionId || eventId.length > 100 || sessionId.length > 100) return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });
    const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
    const ip = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
    const day = new Date().toISOString().slice(0, 10);
    await recordAnalyticsEvent({ eventId, sessionId, visitorHash: hashVisitor(ip, day), eventType: eventType as typeof eventTypes[number], path, durationSeconds });
    const response = NextResponse.json({ ok: true });
    if (!request.headers.get("cookie")?.includes("pp_sid=")) response.cookies.set("pp_sid", sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ error: "Analytics unavailable." }, { status: 400 });
  }
}