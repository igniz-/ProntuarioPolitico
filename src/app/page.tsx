"use client";

import { FormEvent, type CSSProperties, useEffect, useRef, useState } from "react";
import type { PoliticianProfile, PoliticianRegistryRecord, PopularRecord, PublicOffice, ResearchItem, ResearchStatus } from "@/lib/types";
import { getTranslation, type Language } from "@/lib/i18n";
type Theme = "light" | "dark";
type AutocompleteRecord = { name: string; aliases?: string[]; imageUrl?: string; country?: string; region?: string; currentPosition?: string };

const researchStatuses: ResearchStatus[] = ["verified", "reported", "disputed", "dismissed", "unknown"];

function displayText(value: unknown, fallback: string): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.summary !== undefined) return displayText(record.summary, fallback);
    if (record.title !== undefined) return displayText(record.title, fallback);
    if (record.amount !== undefined && record.currency !== undefined) return `${displayText(record.amount, fallback)} ${displayText(record.currency, "")}`.trim();
  }
  return fallback;
}

function normalizeStatus(value: unknown): ResearchStatus {
  const status = displayText(value, "unknown").toLowerCase().trim();
  return researchStatuses.includes(status as ResearchStatus) ? status as ResearchStatus : "unknown";
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  const confidence = displayText(value, "").toLowerCase();
  const overall = confidence.split(/[,:;]/, 1)[0];
  if (overall.includes("low") || overall.includes("baja")) return "low";
  if (overall.includes("medium") || overall.includes("media")) return "medium";
  if (overall.includes("high") || overall.includes("alta")) return "high";
  return "high";
}

function createClientId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function sourceUrl(value: unknown) {
  const candidate = displayText(value, "");
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function SourceLink({ source, url, fallback }: { source: unknown; url: unknown; fallback: string }) {
  const label = displayText(source, fallback);
  const href = sourceUrl(url);
  return href ? <a className="source-link" href={href} target="_blank" rel="noreferrer">{label} ↗</a> : <span>{label}</span>;
}

function Item({ item, language }: { item: ResearchItem; language: Language }) {
  const text = getTranslation(language);
  const status = normalizeStatus(item.status);
  const title = displayText(item.title, text.current);
  const summary = displayText(item.summary, text.sourcePending);
  const date = displayText(item.date, text.current);
  const source = displayText(item.source, text.sourcePending);
  return <details className="item"><summary><span className="item-title">{title}</span><span className={`status ${status}`}>{text.statuses[status]}</span><span className="item-chevron">+</span></summary><div className="item-detail"><p>{summary}</p><footer>{date}<span>•</span><SourceLink source={item.source} url={item.sourceUrl} fallback={text.sourcePending} /></footer></div></details>;
}

function ProfileImage({ profile }: { profile: PoliticianProfile }) {
  if (profile.imageUrl) return <img className="portrait-image" src={profile.imageUrl} alt={profile.name} />;
  return <div className="portrait-fallback">{profile.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>;
}

function SpectrumDiagram({ profile, language }: { profile: PoliticianProfile; language: Language }) {
  const labels = getTranslation(language).spectrum;
  const x = typeof profile.spectrum?.x === "number" && Number.isFinite(profile.spectrum.x) ? Math.max(-100, Math.min(100, profile.spectrum.x)) : undefined;
  const y = typeof profile.spectrum?.y === "number" && Number.isFinite(profile.spectrum.y) ? Math.max(-100, Math.min(100, profile.spectrum.y)) : undefined;
  if (x === undefined || y === undefined) return null;
  const style = x === undefined || y === undefined ? undefined : { "--spectrum-x": `${50 + x / 2}%`, "--spectrum-y": `${50 - y / 2}%` } as CSSProperties;
  return <div className="spectrum" aria-label={`${labels.progressive} - ${labels.conservative}; ${labels.libertarian} - ${labels.authoritarian}`}>
    <span className="spectrum-label spectrum-top">{labels.authoritarian}</span><span className="spectrum-label spectrum-right">{labels.conservative}</span><span className="spectrum-label spectrum-bottom">{labels.libertarian}</span><span className="spectrum-label spectrum-left">{labels.progressive}</span><div className="spectrum-crosshair" style={style}><span className="spectrum-dot"></span></div>
  </div>;
}

function OfficeTimeline({ profile, language }: { profile: PoliticianProfile; language: Language }) {
  const text = getTranslation(language);
  const offices: PublicOffice[] = profile.offices?.length ? profile.offices : [{ title: profile.position, startDate: profile.tenure, status: "unknown", source: text.sourcePending }];
  return <details className="timeline"><summary className="timeline-summary"><span className="section-number gold">↗</span><span className="timeline-summary-copy"><span className="timeline-summary-heading"><h2>{text.offices} <span className="timeline-count">({offices.length})</span></h2></span><p>{text.officesSub}</p></span><span className="item-chevron">+</span></summary><div className="timeline-list">{offices.map((office, index) => { const status = normalizeStatus(office.status); const title = displayText(office.title, text.current); const startDate = displayText(office.startDate, text.sourcePending); const endDate = office.endDate ? displayText(office.endDate, text.present) : text.present; return <article className="timeline-entry" key={`${title}-${startDate}-${index}`}><div className="timeline-marker"></div><div className="timeline-content"><div className="timeline-heading"><h3>{title}</h3><span className={`status ${status}`}>{text.statuses[status]}</span></div><p>{startDate} <span>→</span> {endDate}</p><small><SourceLink source={office.source} url={office.sourceUrl} fallback={text.sourcePending} /></small></div></article>; })}</div></details>;
}

export default function Home({ initialSlug }: { initialSlug?: string }) {
  const [language, setLanguage] = useState<Language>("es");
  const [theme, setTheme] = useState<Theme>("light");
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<PoliticianProfile | null>(null);
  const [popular, setPopular] = useState<PopularRecord[]>([]);
  const [registry, setRegistry] = useState<PoliticianRegistryRecord[]>([]);
  const [resultCache] = useState(() => new Map<string, PoliticianProfile>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cached, setCached] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportIssue, setReportIssue] = useState("");
  const [reportSource, setReportSource] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const resultsRef = useRef<HTMLElement | null>(null);
  const analyticsSession = useRef("");
  const analyticsStartedAt = useRef(0);
  const text = getTranslation(language);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("pp-language") as Language | null;
    const savedTheme = window.localStorage.getItem("pp-theme") as Theme | null;
    if (savedLanguage === "en" || savedLanguage === "es") setLanguage(savedLanguage);
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    fetch("/api/popular").then((response) => response.json()).then((data) => setPopular(data.records ?? [])).catch(() => undefined);
    if (initialSlug) void searchName(initialSlug, false, initialSlug);
  }, [initialSlug]);

  useEffect(() => {
    const sessionId = createClientId();
    const startedAt = Date.now();
    analyticsSession.current = sessionId;
    analyticsStartedAt.current = startedAt;
    const sendEvent = (eventType: "page_view" | "session_end", durationSeconds = 0) => {
      const payload = JSON.stringify({ eventId: `${sessionId}-${eventType}`, sessionId, eventType, path: window.location.pathname, durationSeconds });
      if (eventType === "session_end" && navigator.sendBeacon) navigator.sendBeacon("/api/analytics", new Blob([payload], { type: "application/json" }));
      else void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
    };
    sendEvent("page_view");
    const finish = () => sendEvent("session_end", (Date.now() - startedAt) / 1000);
    window.addEventListener("pagehide", finish);
    return () => window.removeEventListener("pagehide", finish);
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (!value) { setRegistry([]); return; }
    fetch(`/api/registry?q=${encodeURIComponent(value)}&limit=8`).then((response) => response.json()).then((data) => setRegistry(data.records ?? [])).catch(() => setRegistry([]));
  }, [query]);

  useEffect(() => {
    if (profile && !loading) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [profile, loading]);

  function changeLanguage(next: Language) { setLanguage(next); window.localStorage.setItem("pp-language", next); }
  function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); window.localStorage.setItem("pp-theme", next); }
  async function copyProfileLink() {
    await navigator.clipboard.writeText(window.location.href);
    if (analyticsSession.current) void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: `${analyticsSession.current}-share-${createClientId()}`, sessionId: analyticsSession.current, eventType: "share_copy", path: window.location.pathname }), keepalive: true });
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2200);
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault(); setReportStatus(""); setLoading(true);
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileSlug: profile?.slug, profileName, issue: reportIssue, sourceUrl: reportSource }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReportIssue(""); setReportSource(""); setReportOpen(false); setReportStatus(text.report.pending);
    } catch (caught) { setReportStatus(caught instanceof Error ? caught.message : text.report.required); }
    finally { setLoading(false); }
  }

  async function searchName(name: string, forceRefresh = false, lookupSlug?: string) {
    if (!name.trim()) return;
    setQuery(name); setLoading(true); setError("");
    const resultKey = `${language}:${name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;
    const rememberedProfile = forceRefresh ? undefined : resultCache.get(resultKey);
    if (rememberedProfile) {
      setProfile(rememberedProfile); setCached(true); setLoading(false);
      return;
    }
    try {
      const refreshParam = forceRefresh ? "&refresh=1" : "";
      const lookup = lookupSlug ? `slug=${encodeURIComponent(lookupSlug)}` : `name=${encodeURIComponent(name)}`;
      const response = await fetch(`/api/research?${lookup}&language=${language}${refreshParam}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProfile(data.profile); setQuery(data.profile.name); setCached(data.cached); resultCache.set(resultKey, data.profile);
      window.history.replaceState({}, "", `/politico/${data.profile.slug}`);
      const popularResponse = await fetch("/api/popular");
      if (popularResponse.ok) setPopular((await popularResponse.json()).records ?? []);
    } catch { setError(text.error); }
    finally { setLoading(false); }
  }

  function handleSearch(event: FormEvent) { event.preventDefault(); void searchName(query); }

  const records: PopularRecord[] = popular;
  const autocompleteRecords = Array.from(new Map< string, AutocompleteRecord>([
    ...registry.map((record) => [`${record.name.toLowerCase()}|${record.country.toLowerCase()}`, record] as const),
    ...records.map((record) => [`${record.name.toLowerCase()}|${(record.country ?? "").toLowerCase()}`, record] as const),
  ]).values());
  const normalizedQuery = query.trim().toLowerCase();
  const autocompleteMatches = normalizedQuery ? autocompleteRecords.filter((record) => [record.name, ...(record.aliases ?? [])].some((value) => value.toLowerCase().includes(normalizedQuery))).slice(0, 8) : [];
  const profileName = displayText(profile?.name, text.current);
  const profileCountry = displayText(profile?.country, text.sourcePending);
  const profileParty = displayText(profile?.party, text.sourcePending);
  const profilePosition = displayText(profile?.position, text.sourcePending);
  const profileTenure = displayText(profile?.tenure, text.sourcePending);
  const profileSalary = displayText(profile?.salary, text.sourcePending);
  const profileSummary = displayText(profile?.summary, text.sourcePending);

  return <main className={theme === "dark" ? "dark" : ""}>
    <nav className="nav"><div className="brand"><span className="brand-mark">PP</span><span>Prontuario<br /><b>Politico</b></span></div><span className="nav-note">{text.desk} <i>•</i> {text.records}</span><div className="nav-actions"><button className="icon-button" onClick={toggleTheme} title={text.theme} aria-label={text.theme}>{theme === "light" ? "☾" : "☀"}</button><button className="language-button" onClick={() => changeLanguage(language === "en" ? "es" : "en")} title={text.language}>{language === "en" ? "ES" : "EN"}</button></div></nav>{loading && <div className="loading-backdrop" role="dialog" aria-modal="true" aria-live="polite"><div className="loading-dialog"><span className="loading-spinner" aria-hidden="true"></span><strong>{text.researching}</strong><p>{text.researchingNote}</p></div></div>}
    <section className="hero"><div className="eyebrow">{text.eyebrow}</div><h1>{text.headline.lead}<br /><em>{text.headline.emphasis}</em>{text.headline.tail}</h1><p className="hero-copy">{text.intro}</p><form className="search" onSubmit={handleSearch}><span className="search-icon">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} placeholder={text.placeholder} aria-label={text.placeholder} autoComplete="off" />{searchFocused && autocompleteMatches.length > 0 && <div className="autocomplete" role="listbox">{autocompleteMatches.map((record) => <button type="button" role="option" key={`${record.name}-${record.country}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(record.name); setSearchFocused(false); }}><span className="autocomplete-avatar">{record.imageUrl ? <img src={record.imageUrl} alt="" /> : record.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{record.name}</strong>{(record.country || record.region) && <small>{[record.country, record.region].filter(Boolean).join(" · ")}</small>}{record.currentPosition && <small>{record.currentPosition}</small>}</span></button>)}</div>}<button type="submit" disabled={loading}>{loading ? text.researching : text.search}<span>↗</span></button></form>{error && <p className="error">{error}</p>}</section>
    {records.length > 0 && <section className="popular landing-popular"><div className="popular-heading"><div><span className="eyebrow">{text.popular}</span><p>{text.popularSub}</p></div></div><div className="popular-list">{records.slice(0, 6).map((record, index) => <button className="popular-record" key={`${record.name}-${index}`} onClick={() => void searchName(record.name)}><span className="popular-avatar">{record.imageUrl ? <img src={record.imageUrl} alt="" /> : record.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{record.name}</strong>{record.searches > 0 && <small>{record.searches} {text.searches}</small>}</span><b>↗</b></button>)}</div></section>}
    {profile && <section ref={resultsRef} className="workspace"><div className="workspace-heading"><div><span className="eyebrow">{text.brief}</span><h2>{profileName}</h2></div><div className="brief-meta"><span className="live-dot"></span>{cached ? text.cached : text.fresh}<small>{text.updated} {displayText(profile.lastUpdated, text.sourcePending)}</small><button className="share-button" type="button" onClick={() => void copyProfileLink()} title={text.share} aria-label={text.share}>{linkCopied ? "✓" : "↗"}<span>{linkCopied ? text.copied : text.share}</span></button><button className="report-button" type="button" onClick={() => { setReportOpen(true); setReportStatus(""); }} title={text.report.open}>{text.report.open}</button>{process.env.NODE_ENV === "development" && <button className="icon-button refresh-button" type="button" onClick={() => void searchName(profileName, true)} disabled={loading} title={text.refresh} aria-label={text.refresh}>↻</button>}</div></div>
      <div className="identity"><div className="portrait"><ProfileImage profile={profile} /></div><div className="identity-copy"><h3>{profilePosition}</h3><p>{profileCountry} <span>•</span> {profileParty}</p><span className={`confidence ${normalizeConfidence(profile.confidence)}`} title={displayText(profile.confidence, text.confidence)}>{text.confidenceLevels[normalizeConfidence(profile.confidence)]} {text.confidence}</span></div><SpectrumDiagram profile={profile} language={language} /></div>
      <div className="facts"><div><span>{text.party}</span><strong>{profileParty}</strong></div><div><span>{text.position}</span><strong>{profilePosition}</strong></div><div><span>{text.tenure}</span><strong>{profileTenure}</strong></div><div><span>{text.salary}</span><strong>{profileSalary}</strong></div></div>
      <p className="summary">{profileSummary}</p><OfficeTimeline profile={profile} language={language} /><div className="columns"><section><div className="section-title"><span className="section-number">01</span><div><h2>{text.laws}</h2><p>{text.lawsSub}</p></div></div>{profile.laws.map((item, index) => <Item item={item} language={language} key={`${item.title}-${index}`} />)}</section><section><div className="section-title"><span className="section-number coral">02</span><div><h2>{text.allegations}</h2><p>{text.allegationsSub}</p></div></div>{profile.allegations.map((item, index) => <Item item={item} language={language} key={`${item.title}-${index}`} />)}</section></div><section className="highlights"><div className="section-title"><span className="section-number gold">03</span><div><h2>{text.highlights}</h2><p>{text.highlightsSub}</p></div></div><div className="highlight-grid">{profile.highlights.map((item, index) => <Item item={item} language={language} key={`${item.title}-${index}`} />)}</div></section>
    </section>}{reportOpen && profile && <div className="report-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title"><form className="report-dialog" onSubmit={submitReport}><h2 id="report-title">{text.report.title}</h2><p>{text.report.review}</p><label>{text.report.issue}<textarea value={reportIssue} onChange={(event) => setReportIssue(event.target.value)} required minLength={10} maxLength={2000} rows={5} /></label><label>{text.report.source}<input type="url" value={reportSource} onChange={(event) => setReportSource(event.target.value)} required placeholder="https://" /></label>{reportStatus && <p className="report-status">{reportStatus}</p>}<div className="report-actions"><button type="button" onClick={() => setReportOpen(false)}>{text.report.cancel}</button><button type="submit">{text.report.submit}</button></div></form></div>}<footer className="site-footer"><span>PRONTUARIO POLITICO</span><span>{text.footerFacts}</span><span>{text.footerCache}</span></footer>
  </main>;
}
