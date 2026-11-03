import { NextResponse } from "next/server";
import { getCachedProfile, cacheProfile, recordSearch } from "@/lib/db";
import { researchPolitician } from "@/lib/research";
import { checkRateLimit } from "@/lib/rate-limit";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim();
  const permalinkSlug = params.get("slug")?.trim();
  const language = params.get("language") === "es" ? "es" : "en";
  const cacheVersion = "v4";
  const forceRefresh = process.env.NODE_ENV === "development" && params.get("refresh") === "1";
  if (!name && !permalinkSlug) return NextResponse.json({ error: "A politician name or profile slug is required." }, { status: 400 });
  if (name && (name.length < 2 || name.length > 200) || permalinkSlug && (permalinkSlug.length < 2 || permalinkSlug.length > 200)) return NextResponse.json({ error: "The politician identifier must be between 2 and 200 characters." }, { status: 400 });
  if (name && !slugify(name) || permalinkSlug && !slugify(permalinkSlug)) return NextResponse.json({ error: "The politician identifier is invalid." }, { status: 400 });
  const rate = checkRateLimit(request, "research", 12, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many research requests. Please try again shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });

  const slug = permalinkSlug ? `${slugify(permalinkSlug)}:${language}:${cacheVersion}` : `${slugify(name as string)}:${language}:${cacheVersion}`;
  const legacySlug = name ? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}:${language}:v3` : `${slugify(permalinkSlug as string)}:${language}:v3`;
  try {
    const cached = forceRefresh ? null : await getCachedProfile(slug) ?? (legacySlug !== slug ? await getCachedProfile(legacySlug) : null);
    if (cached) {
        void recordSearch(cached).catch((error) => console.error("Could not record cached search", error));
      return NextResponse.json({ profile: cached, cached: true });
    }
    const stale = forceRefresh ? null : await getCachedProfile(slug, true) ?? (legacySlug !== slug ? await getCachedProfile(legacySlug, true) : null);
    if (!name && !stale) return NextResponse.json({ error: "That politician profile was not found." }, { status: 404 });
    const profile = await researchPolitician(name ?? stale!.name, language, stale ?? undefined);
    await cacheProfile(profile, slug);
    const canonicalSlug = `${profile.slug}:${language}:${cacheVersion}`;
    if (canonicalSlug !== slug) await cacheProfile(profile, canonicalSlug);
      void recordSearch(profile).catch((error) => console.error("Could not record search", error));
    return NextResponse.json({ profile, cached: false });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: language === "es" ? "La investigación no está disponible temporalmente. Revisa la configuración de Azure e inténtalo de nuevo." : "Research is temporarily unavailable. Check your Azure settings and try again." }, { status: 502 });
  }
}
