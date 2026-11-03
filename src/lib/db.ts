import { createClient, type Client } from "@libsql/client";
import { createHash } from "node:crypto";
import type { PoliticianProfile, PoliticianRegistryRecord, PopularRecord } from "./types";
import { getStructuredCorrection, type ReportModeration } from "./report-moderation";
import { researchPolitician } from "./research";

let client: Client | undefined;
const DEFAULT_CACHE_TTL_HOURS = 24;
const memoryCache = new Map<string, { profile: PoliticianProfile; expiresAt: number }>();

function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getCacheTtlHours() {
  const configured = Number(process.env.CACHE_TTL_HOURS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CACHE_TTL_HOURS;
}

function normalizeCachedProfile(profile: PoliticianProfile): PoliticianProfile {
  if (typeof profile.tenure !== "string" || !profile.tenure.trim().startsWith("{")) return profile;
  try {
    const parsed = JSON.parse(profile.tenure) as Record<string, unknown>;
    if (typeof parsed.startDate !== "string") return profile;
    const endDate = typeof parsed.endDate === "string" ? ` - ${parsed.endDate}` : "";
    return { ...profile, tenure: `${parsed.startDate}${endDate}` };
  } catch {
    return profile;
  }
}

function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? "file:./data/prontuario.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export async function initDatabase() {
  await getClient().execute(`CREATE TABLE IF NOT EXISTS research_cache (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`);
  await getClient().execute(`CREATE TABLE IF NOT EXISTS popular_searches (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    country TEXT,
    searches INTEGER NOT NULL DEFAULT 0,
    last_searched_at TEXT NOT NULL
  )`);
  const popularColumns = await getClient().execute("PRAGMA table_info(popular_searches)");
  if (!popularColumns.rows.some((row) => String(row.name) === "country")) await getClient().execute("ALTER TABLE popular_searches ADD COLUMN country TEXT");
  await getClient().execute(`CREATE TABLE IF NOT EXISTS data_reports (
    id TEXT PRIMARY KEY,
    profile_slug TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    issue TEXT NOT NULL,
    source_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    moderation_status TEXT NOT NULL DEFAULT 'review',
    moderation_confidence TEXT NOT NULL DEFAULT 'low',
    moderation_reason TEXT NOT NULL DEFAULT '',
    proposed_correction TEXT,
    moderated_at TEXT,
    created_at TEXT NOT NULL
  )`);
  const reportColumns = await getClient().execute("PRAGMA table_info(data_reports)");
  if (!reportColumns.rows.some((row) => String(row.name) === "moderation_status")) await getClient().execute("ALTER TABLE data_reports ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'review'");
  if (!reportColumns.rows.some((row) => String(row.name) === "moderation_confidence")) await getClient().execute("ALTER TABLE data_reports ADD COLUMN moderation_confidence TEXT NOT NULL DEFAULT 'low'");
  if (!reportColumns.rows.some((row) => String(row.name) === "moderation_reason")) await getClient().execute("ALTER TABLE data_reports ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT ''");
  if (!reportColumns.rows.some((row) => String(row.name) === "proposed_correction")) await getClient().execute("ALTER TABLE data_reports ADD COLUMN proposed_correction TEXT");
  if (!reportColumns.rows.some((row) => String(row.name) === "moderated_at")) await getClient().execute("ALTER TABLE data_reports ADD COLUMN moderated_at TEXT");
  await getClient().execute(`CREATE TABLE IF NOT EXISTS analytics_sessions (
    session_id TEXT PRIMARY KEY,
    visitor_hash TEXT NOT NULL,
    path TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0
  )`);
  await getClient().execute(`CREATE TABLE IF NOT EXISTS analytics_events (
    event_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  await getClient().execute(`CREATE TABLE IF NOT EXISTS politician_registry (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    normalized_aliases TEXT NOT NULL DEFAULT '[]',
    image_url TEXT,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    current_position TEXT,
    source_url TEXT NOT NULL,
    last_verified_at TEXT NOT NULL
  )`);
  const registryColumns = await getClient().execute("PRAGMA table_info(politician_registry)");
  if (!registryColumns.rows.some((row) => String(row.name) === "normalized_name")) await getClient().execute("ALTER TABLE politician_registry ADD COLUMN normalized_name TEXT NOT NULL DEFAULT ''");
  if (!registryColumns.rows.some((row) => String(row.name) === "normalized_aliases")) await getClient().execute("ALTER TABLE politician_registry ADD COLUMN normalized_aliases TEXT NOT NULL DEFAULT '[]'");
  await getClient().execute("CREATE INDEX IF NOT EXISTS idx_politician_registry_name ON politician_registry(normalized_name)");
  await getClient().execute("CREATE INDEX IF NOT EXISTS idx_politician_registry_country_region ON politician_registry(country, region)");
}

export async function upsertRegistryRecords(records: PoliticianRegistryRecord[]) {
  await initDatabase();
  for (const record of records) {
    await getClient().execute({
      sql: `INSERT INTO politician_registry (id, name, normalized_name, aliases, normalized_aliases, image_url, country, region, current_position, source_url, last_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name, aliases = excluded.aliases, normalized_aliases = excluded.normalized_aliases, image_url = COALESCE(excluded.image_url, politician_registry.image_url), country = excluded.country, region = excluded.region, current_position = COALESCE(excluded.current_position, politician_registry.current_position), source_url = excluded.source_url, last_verified_at = excluded.last_verified_at`,
      args: [record.id, record.name, normalizeSearchText(record.name), JSON.stringify(record.aliases ?? []), JSON.stringify((record.aliases ?? []).map(normalizeSearchText)), record.imageUrl ?? null, record.country, record.region, record.currentPosition ?? null, record.sourceUrl, record.lastVerifiedAt],
    });
  }
}

export async function getRegistryRecords(limit = 1000): Promise<PoliticianRegistryRecord[]> {
  await initDatabase();
  const result = await getClient().execute({ sql: "SELECT id, name, aliases, image_url, country, region, current_position, source_url, last_verified_at FROM politician_registry ORDER BY name LIMIT ?", args: [Math.max(1, Math.min(5000, limit))] });
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), aliases: JSON.parse(String(row.aliases ?? "[]")) as string[], imageUrl: row.image_url ? String(row.image_url) : undefined, country: String(row.country), region: String(row.region), currentPosition: row.current_position ? String(row.current_position) : undefined, sourceUrl: String(row.source_url), lastVerifiedAt: String(row.last_verified_at) }));
}

export async function getRegistrySuggestions(query: string, limit = 8): Promise<PoliticianRegistryRecord[]> {
  await initDatabase();
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const result = await getClient().execute({ sql: "SELECT id, name, aliases, image_url, country, region, current_position, source_url, last_verified_at FROM politician_registry WHERE normalized_name LIKE ? OR normalized_aliases LIKE ? ORDER BY CASE WHEN normalized_name LIKE ? THEN 0 ELSE 1 END, name LIMIT ?", args: [`%${normalizedQuery}%`, `%${normalizedQuery}%`, `${normalizedQuery}%`, Math.max(1, Math.min(8, limit))] });
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), aliases: JSON.parse(String(row.aliases ?? "[]")) as string[], imageUrl: row.image_url ? String(row.image_url) : undefined, country: String(row.country), region: String(row.region), currentPosition: row.current_position ? String(row.current_position) : undefined, sourceUrl: String(row.source_url), lastVerifiedAt: String(row.last_verified_at) }));
}

export async function hasRecentDataReport(profileSlug: string, sourceUrl: string) {
  await initDatabase();
  const result = await getClient().execute({ sql: "SELECT id FROM data_reports WHERE profile_slug = ? AND source_url = ? AND created_at >= datetime('now', '-1 day') LIMIT 1", args: [profileSlug, sourceUrl] });
  return result.rows.length > 0;
}

export async function createDataReport(profileSlug: string, profileName: string, issue: string, sourceUrl: string, moderation: ReportModeration) {
  await initDatabase();
  const proposedCorrection = typeof moderation.proposedCorrection === "string" ? moderation.proposedCorrection : moderation.proposedCorrection ? JSON.stringify(moderation.proposedCorrection) : null;
  await getClient().execute({
    sql: "INSERT INTO data_reports (id, profile_slug, profile_name, issue, source_url, status, moderation_status, moderation_confidence, moderation_reason, proposed_correction, moderated_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)",
    args: [`${Date.now()}-${Math.random().toString(36).slice(2)}`, profileSlug, profileName, issue, sourceUrl, moderation.status, moderation.confidence, moderation.reason, proposedCorrection, new Date().toISOString(), new Date().toISOString()],
  });
}

export function hashVisitor(ip: string, date: string) {
  const salt = process.env.ANALYTICS_HASH_SECRET ?? process.env.ADMIN_TOKEN ?? "development-analytics-salt";
  return createHash("sha256").update(`${salt}:${date}:${ip}`).digest("hex");
}

export async function recordAnalyticsEvent(input: { eventId: string; sessionId: string; visitorHash: string; eventType: "page_view" | "share_copy" | "session_end"; path: string; durationSeconds?: number }) {
  await initDatabase();
  const now = new Date().toISOString();
  const duration = Math.max(0, Math.min(86_400, Math.round(input.durationSeconds ?? 0)));
  await getClient().execute({
    sql: "INSERT OR IGNORE INTO analytics_events (event_id, session_id, event_type, path, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [input.eventId, input.sessionId, input.eventType, input.path, now],
  });
  await getClient().execute({
    sql: `INSERT INTO analytics_sessions (session_id, visitor_hash, path, started_at, last_seen_at, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, duration_seconds = MAX(analytics_sessions.duration_seconds, excluded.duration_seconds)`,
    args: [input.sessionId, input.visitorHash, input.path, now, now, duration],
  });
}

export async function getAnalyticsSummary() {
  await initDatabase();
  const [totals, recent, paths, reports] = await Promise.all([
    getClient().execute("SELECT COUNT(*) AS sessions, COUNT(DISTINCT visitor_hash) AS unique_visitors, COALESCE(AVG(NULLIF(duration_seconds, 0)), 0) AS average_duration FROM analytics_sessions WHERE started_at >= datetime('now', '-30 days')"),
    getClient().execute("SELECT date(started_at) AS day, COUNT(*) AS visits, COUNT(DISTINCT visitor_hash) AS unique_visitors FROM analytics_sessions WHERE started_at >= datetime('now', '-14 days') GROUP BY date(started_at) ORDER BY day DESC"),
    getClient().execute("SELECT path, COUNT(*) AS views FROM analytics_events WHERE event_type = 'page_view' AND created_at >= datetime('now', '-30 days') GROUP BY path ORDER BY views DESC LIMIT 10"),
    getClient().execute("SELECT id, profile_name, issue, source_url, status, moderation_status, moderation_confidence, moderation_reason, proposed_correction, created_at FROM data_reports WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50"),
  ]);
  const shareEvents = await getClient().execute("SELECT COUNT(*) AS shares FROM analytics_events WHERE event_type = 'share_copy' AND created_at >= datetime('now', '-30 days')");
  return {
    totals: totals.rows[0],
    shares: Number(shareEvents.rows[0]?.shares ?? 0),
    recent: recent.rows,
    paths: paths.rows,
    reports: reports.rows,
  };
}

export async function resolveDataReport(id: string, status: "approved" | "rejected") {
  await initDatabase();
  const report = await getClient().execute({ sql: "SELECT profile_slug, profile_name, issue, source_url, proposed_correction FROM data_reports WHERE id = ? AND status = 'pending'", args: [id] });
  const row = report.rows[0];
  if (!row) throw new Error("Report not found or already resolved.");
  if (status === "rejected") {
    await getClient().execute({ sql: "UPDATE data_reports SET status = 'rejected', moderated_at = ? WHERE id = ?", args: [new Date().toISOString(), id] });
    return;
  }
  const profileSlug = String(row.profile_slug);
  const cached = await getClient().execute({ sql: "SELECT slug, payload FROM research_cache WHERE slug = ? OR slug LIKE ?", args: [profileSlug, `${profileSlug}:%`] });
  if (cached.rows.length === 0) throw new Error("The cached profile is unavailable; refresh it before approving this report.");
  const correction = getStructuredCorrection(row.proposed_correction);
  if (!correction) {
    const cachedProfile = JSON.parse(String(cached.rows[0].payload)) as PoliticianProfile;
    const cacheKey = String(cached.rows[0].slug);
    const language = cacheKey.split(":")[1] === "es" ? "es" : "en";
    const researched = await researchPolitician(String(row.profile_name), language, cachedProfile, { issue: String(row.issue), sourceUrl: String(row.source_url) });
    await cacheProfile(researched, cacheKey);
    await getClient().execute({ sql: "DELETE FROM data_reports WHERE id = ?", args: [id] });
    return;
  }
  for (const cachedRow of cached.rows) {
    const profile = JSON.parse(String(cachedRow.payload)) as Record<string, unknown>;
    profile[correction.field] = correction.value;
    await cacheProfile(profile as unknown as PoliticianProfile, String(cachedRow.slug));
    memoryCache.delete(String(cachedRow.slug));
  }
  await getClient().execute({ sql: "DELETE FROM data_reports WHERE id = ?", args: [id] });
}

export async function recordSearch(profile: PoliticianProfile) {
  await initDatabase();
  await getClient().execute({
    sql: `INSERT INTO popular_searches (slug, name, image_url, country, searches, last_searched_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(slug) DO UPDATE SET name = excluded.name, image_url = excluded.image_url, country = excluded.country,
      searches = popular_searches.searches + 1, last_searched_at = excluded.last_searched_at`,
    args: [profile.slug, profile.name, profile.imageUrl ?? null, profile.country, new Date().toISOString()],
  });
}

export async function getPopularSearches(limit = 24): Promise<PopularRecord[]> {
  await initDatabase();
  const result = await getClient().execute({
    sql: "SELECT name, image_url, country, searches, last_searched_at FROM popular_searches ORDER BY searches DESC, last_searched_at DESC",
    args: [],
  });
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/);
  const distance = (left: string, right: string) => {
    const matrix = Array.from({ length: left.length + 1 }, (_, row) => Array.from({ length: right.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));
    for (let row = 1; row <= left.length; row++) for (let column = 1; column <= right.length; column++) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    return matrix[left.length][right.length];
  };
  const similar = (left: string, right: string, leftCountry?: string, rightCountry?: string) => {
    if (leftCountry && rightCountry && normalize(leftCountry).join(" ") !== normalize(rightCountry).join(" ")) return false;
    const leftWords = normalize(left); const rightWords = normalize(right);
    if (leftWords[0] !== rightWords[0]) return false;
    const leftSurname = leftWords[leftWords.length - 1]; const rightSurname = rightWords[rightWords.length - 1];
    return distance(leftSurname, rightSurname) <= 1 && (leftWords.length === rightWords.length || leftWords.length + 1 === rightWords.length || rightWords.length + 1 === leftWords.length);
  };
  const merged: Array<PopularRecord & { lastSearchedAt: string }> = [];
  for (const row of result.rows) {
    const record = { name: String(row.name), imageUrl: row.image_url ? String(row.image_url) : undefined, country: row.country ? String(row.country) : undefined, searches: Number(row.searches), lastSearchedAt: String(row.last_searched_at) };
    const existing = merged.find((candidate) => similar(candidate.name, record.name, candidate.country, record.country));
    if (!existing) merged.push(record);
    else {
      existing.searches += record.searches;
      existing.imageUrl ||= record.imageUrl;
      existing.country ||= record.country;
      if (normalize(record.name).length > normalize(existing.name).length) existing.name = record.name;
      if (record.lastSearchedAt > existing.lastSearchedAt) existing.lastSearchedAt = record.lastSearchedAt;
    }
  }
  return merged.sort((left, right) => right.searches - left.searches || right.lastSearchedAt.localeCompare(left.lastSearchedAt)).slice(0, limit).map(({ lastSearchedAt, ...record }) => record);
}

export async function getCachedProfile(slug: string, includeExpired = false) {
  const remembered = memoryCache.get(slug);
  if (remembered) {
    if (remembered.expiresAt > Date.now() || includeExpired) return normalizeCachedProfile(remembered.profile);
  }
  await initDatabase();
  const result = await getClient().execute({
    sql: "SELECT payload, expires_at FROM research_cache WHERE slug = ?",
    args: [slug],
  });
  const row = result.rows[0];
  if (!row || (!includeExpired && new Date(String(row.expires_at)) <= new Date())) return null;
  const profile = normalizeCachedProfile(JSON.parse(String(row.payload)) as PoliticianProfile);
  memoryCache.set(slug, { profile, expiresAt: new Date(String(row.expires_at)).getTime() });
  return profile;
}

export async function cacheProfile(profile: PoliticianProfile, cacheKey = profile.slug) {
  await initDatabase();
  const now = new Date();
  const expires = new Date(now.getTime() + getCacheTtlHours() * 60 * 60 * 1000);
  memoryCache.set(cacheKey, { profile, expiresAt: expires.getTime() });
  await getClient().execute({
    sql: `INSERT INTO research_cache (slug, name, payload, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET name = excluded.name, payload = excluded.payload,
      updated_at = excluded.updated_at, expires_at = excluded.expires_at`,
    args: [cacheKey, profile.name, JSON.stringify(profile), now.toISOString(), expires.toISOString()],
  });
}
