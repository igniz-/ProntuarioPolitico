import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const registryPath = new URL("../data/politician-registry.json", import.meta.url);
const sourcesPath = new URL("../data/registry-sources.json", import.meta.url);
const dryRun = process.argv.includes("--dry-run");
const timeoutMs = 10000;
const discoveryTimeoutMs = 30000;
const db = createClient({ url: process.env.TURSO_DATABASE_URL ?? "file:./data/prontuario.db", authToken: process.env.TURSO_AUTH_TOKEN });

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function wikipediaSummaryUrl(sourceUrl) {
  const source = new URL(sourceUrl);
  if (source.hostname !== "en.wikipedia.org" || !source.pathname.startsWith("/wiki/")) return null;
  const title = decodeURIComponent(source.pathname.slice("/wiki/".length));
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "prontuario-politico-registry/1.0" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url, encoding = "utf-8") {
  const response = await fetch(url, { headers: { accept: "text/csv,text/plain,application/json", "user-agent": "prontuario-politico-registry/1.0" }, signal: AbortSignal.timeout(discoveryTimeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new TextDecoder(encoding).decode(await response.arrayBuffer());
}

async function verifySource(url) {
  const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml", "user-agent": "prontuario-politico-registry/1.0" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  await response.body?.cancel();
}

function commonsFileUrl(value) {
  if (!value) return undefined;
  const filename = String(value).split("File:").pop();
  return filename ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}` : undefined;
}

async function discoverWikidataPoliticians(source) {
  const url = new URL(source.endpoint);
  url.searchParams.set("query", `${source.query.trim()} LIMIT ${Math.max(1, Math.min(1000, source.limit ?? 250))}`);
  url.searchParams.set("format", "json");
  const response = await fetch(url, { headers: { accept: "application/sparql-results+json", "user-agent": "prontuario-politico-registry/1.0" }, signal: AbortSignal.timeout(discoveryTimeoutMs) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = await response.json();
  return (payload.results?.bindings ?? []).flatMap((binding) => {
    const id = binding.item?.value?.split("/").pop();
    const name = binding.itemLabel?.value;
    if (!id || !name || name.startsWith("Q")) return [];
    const district = binding.districtLabel?.value;
    return [{ id: `wikidata-${id}`, name, imageUrl: commonsFileUrl(binding.image?.value), country: source.country, region: source.region, currentPosition: district ? `${source.currentPosition} · ${district}` : source.currentPosition, sourceUrl: `https://www.wikidata.org/wiki/${id}`, lastVerifiedAt: new Date().toISOString().slice(0, 10) }];
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "").trim()) ?? [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

function authorityName(value) {
  const [surname, givenNames] = String(value ?? "").split(",").map((part) => part.trim());
  return givenNames && surname ? `${givenNames} ${surname}` : String(value ?? "").trim();
}

async function discoverOfficialPoliticians(source) {
  if (source.kind === "official-json-record-list") {
    const payload = await fetchJson(source.endpoint);
    const rows = payload.table?.rows;
    if (!Array.isArray(rows)) throw new Error("official JSON source did not contain table.rows");
    return rows.slice(0, Math.max(1, Math.min(5000, source.limit ?? 250))).flatMap((row) => {
      const id = row.ID?.trim();
      const surname = row.APELLIDO?.trim();
      const givenName = row.NOMBRE?.trim();
      if (!id || !surname || !givenName) return [];
      return [{ id: `argentina-senado-${id}`, name: `${givenName} ${surname}`, imageUrl: row.FOTO || undefined, country: source.country, region: row.PROVINCIA?.trim() || source.region, currentPosition: source.currentPosition, sourceUrl: source.endpoint, lastVerifiedAt: new Date().toISOString().slice(0, 10) }];
    });
  }

  const rows = parseCsv(await fetchText(source.endpoint, source.encoding));
  if (source.id === "argentina-hcdn-current-deputies") {
    return rows.slice(0, Math.max(1, Math.min(5000, source.limit ?? 250))).flatMap((row) => {
      const surname = row.Apellido?.trim();
      const givenName = row.Nombre?.trim();
      if (!surname || !givenName) return [];
      return [{ id: `argentina-hcdn-${normalize(`${givenName}-${surname}`)}`, name: `${givenName} ${surname}`, country: source.country, region: row.Distrito?.trim() || source.region, currentPosition: source.currentPosition, sourceUrl: source.endpoint, lastVerifiedAt: new Date().toISOString().slice(0, 10) }];
    });
  }

  if (source.id === "argentina-refeglo-local-authorities") {
    return rows.slice(0, Math.max(1, Math.min(5000, source.limit ?? 2500))).flatMap((row) => {
      const id = row.cod_gl_res144_indec?.trim();
      const name = authorityName(row["apellido_y_nombre_de_la_maxima_autoridad."]);
      if (!id || !name) return [];
      const localGovernment = row.nombre_del_gobierno_local?.trim();
      return [{ id: `argentina-refeglo-${id}`, name, country: source.country, region: row.provincia?.trim() || source.region, currentPosition: `${source.currentPosition} · ${localGovernment}`, sourceUrl: source.endpoint, lastVerifiedAt: new Date().toISOString().slice(0, 10) }];
    });
  }

  throw new Error(`unsupported official source ${source.id}`);
}

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const refreshed = [];
for (const record of registry) {
  try {
    const source = new URL(record.sourceUrl);
    await verifySource(record.sourceUrl);
    let next = { ...record, lastVerifiedAt: new Date().toISOString().slice(0, 10) };
    const summaryUrl = wikipediaSummaryUrl(record.sourceUrl);
    if (summaryUrl) {
      const summary = await fetchJson(summaryUrl);
      if (summary.thumbnail?.source) next.imageUrl = summary.thumbnail.source;
      if (summary.title && !record.name) next.name = summary.title;
    }
    refreshed.push(next);
    console.log(`OK ${record.name} ${source.hostname}`);
  } catch (error) {
    refreshed.push(record);
    console.error(`SKIP ${record.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const discovered = [];
for (const source of sources.filter((candidate) => candidate.enabled)) {
  try {
    const candidates = source.kind === "wikidata-position-list" ? await discoverWikidataPoliticians(source) : await discoverOfficialPoliticians(source);
    discovered.push(...candidates);
    console.log(`DISCOVER ${source.id}: ${candidates.length} candidates`);
  } catch (error) {
    console.error(`SOURCE ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const merged = new Map(refreshed.map((record) => [`${record.name.toLowerCase()}|${record.country.toLowerCase()}`, record]));
for (const candidate of discovered) {
  const key = `${candidate.name.toLowerCase()}|${candidate.country.toLowerCase()}`;
  const existing = merged.get(key);
  merged.set(key, existing ? { ...candidate, ...existing, aliases: [...new Set([...(candidate.aliases ?? []), ...(existing.aliases ?? [])])], imageUrl: existing.imageUrl ?? candidate.imageUrl } : candidate);
}

if (!dryRun) {
  await db.execute(`CREATE TABLE IF NOT EXISTS politician_registry (
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
  await db.execute("CREATE INDEX IF NOT EXISTS idx_politician_registry_name ON politician_registry(normalized_name)");
  for (const record of merged.values()) {
    const aliases = record.aliases ?? [];
    await db.execute({
      sql: `INSERT INTO politician_registry (id, name, normalized_name, aliases, normalized_aliases, image_url, country, region, current_position, source_url, last_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name, aliases = excluded.aliases, normalized_aliases = excluded.normalized_aliases, image_url = COALESCE(excluded.image_url, politician_registry.image_url), country = excluded.country, region = excluded.region, current_position = COALESCE(excluded.current_position, politician_registry.current_position), source_url = excluded.source_url, last_verified_at = excluded.last_verified_at`,
      args: [record.id, record.name, normalize(record.name), JSON.stringify(aliases), JSON.stringify(aliases.map(normalize)), record.imageUrl ?? null, record.country, record.region, record.currentPosition ?? null, record.sourceUrl, record.lastVerifiedAt],
    });
  }
}
console.log(`${dryRun ? "Checked" : "Updated"} ${merged.size} registry records.`);