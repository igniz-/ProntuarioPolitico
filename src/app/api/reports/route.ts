import { NextResponse } from "next/server";
import { createDataReport, hasRecentDataReport } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { moderateReport } from "@/lib/report-moderation";

export async function POST(request: Request) {
  const rate = checkRateLimit(request, "reports", 3, 24 * 60 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many reports. Please try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_000) return NextResponse.json({ error: "The report is too large." }, { status: 413 });
  let profileSlug = "";
  let profileName = "";
  let issue = "";
  let sourceUrl = "";
  try {
    const body = await request.json() as Record<string, unknown>;
    profileSlug = typeof body.profileSlug === "string" ? body.profileSlug.trim() : "";
    profileName = typeof body.profileName === "string" ? body.profileName.trim() : "";
    issue = typeof body.issue === "string" ? body.issue.trim() : "";
    sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
    const parsedSource = new URL(sourceUrl);
    if (!profileSlug || profileSlug.length > 200 || !profileName || profileName.length > 300 || issue.length < 10 || issue.length > 1200 || sourceUrl.length > 2000 || !["http:", "https:"].includes(parsedSource.protocol)) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Please provide a description and a valid HTTP or HTTPS source URL." }, { status: 400 });
  }
  try {
    if (await hasRecentDataReport(profileSlug, sourceUrl)) return NextResponse.json({ error: "A similar report was already submitted recently." }, { status: 409 });
    const moderation = await moderateReport({ profileName, issue, sourceUrl });
    await createDataReport(profileSlug, profileName, issue, sourceUrl, moderation);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The report could not be saved. Please try again later." }, { status: 500 });
  }
}