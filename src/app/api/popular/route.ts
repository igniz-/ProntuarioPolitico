import { NextResponse } from "next/server";
import { getPopularSearches } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json({ records: await getPopularSearches() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ records: [] });
  }
}