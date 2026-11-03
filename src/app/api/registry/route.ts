import { NextResponse } from "next/server";
import { getRegistrySuggestions } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "8");
    if (query.length > 100) return NextResponse.json({ error: "The search query is too long." }, { status: 400 });
    return NextResponse.json({ records: query ? await getRegistrySuggestions(query, limit) : [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ records: [] });
  }
}