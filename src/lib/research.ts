import type { PoliticianProfile } from "./types";
import { researchConfig } from "./research-config";
import { z } from "zod";

const sourceUrlSchema = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
const statusSchema = z.preprocess((value) => value === null ? "unknown" : value, z.enum(["verified", "reported", "disputed", "dismissed", "unknown"]));
const requiredText = (maxLength: number, minimumLength = 0) => z.preprocess((value) => value === null ? "" : value, z.string().trim().min(minimumLength).max(maxLength));
const optionalText = (maxLength: number) => z.preprocess((value) => value === null ? undefined : value, z.string().trim().max(maxLength).optional());
const optionalSourceUrl = z.preprocess((value) => value === null ? undefined : value, sourceUrlSchema.optional());
const optionalBoolean = z.preprocess((value) => value === null ? undefined : value, z.boolean().optional());
const optionalSpectrum = z.preprocess((value) => value === null ? undefined : value, z.object({
  x: z.number().finite().min(researchConfig.validation.spectrumMin).max(researchConfig.validation.spectrumMax),
  y: z.number().finite().min(researchConfig.validation.spectrumMin).max(researchConfig.validation.spectrumMax),
}).optional());
const researchItemSchema = z.object({
  title: requiredText(researchConfig.validation.itemTitleMaxLength, researchConfig.validation.minimumTextLength),
  summary: requiredText(researchConfig.validation.itemSummaryMaxLength, researchConfig.validation.minimumTextLength),
  status: statusSchema,
  date: optionalText(researchConfig.validation.itemDateMaxLength),
  source: optionalText(researchConfig.validation.itemSourceMaxLength),
  sourceUrl: optionalSourceUrl,
  permanent: optionalBoolean,
});

function modelText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.startDate === "string") {
      const endDate = typeof record.endDate === "string" ? ` - ${record.endDate}` : "";
      return `${record.startDate}${endDate}`;
    }
    for (const key of ["summary", "text", "value", "label", "level", "rating"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number") return String(record[key]);
    }
    if (record.amount !== undefined) {
      const amount = modelText(record.amount);
      const currency = record.currency === undefined ? "" : ` ${modelText(record.currency)}`;
      return `${amount}${currency}`.trim();
    }
    return JSON.stringify(value);
  }
  return "";
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  if (typeof value === "number" && Number.isFinite(value)) {
    const percentage = value <= researchConfig.confidence.fractionScaleMax ? value * researchConfig.confidence.percentageScale : value;
    if (percentage >= researchConfig.confidence.highMinimum) return "high";
    if (percentage >= researchConfig.confidence.mediumMinimum) return "medium";
    return "low";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["confidence", "level", "rating", "label", "value", "score"]) {
      if (record[key] !== undefined) return normalizeConfidence(record[key]);
    }
  }
  const text = modelText(value).toLowerCase();
  const numeric = Number(text);
  if (text && Number.isFinite(numeric)) return normalizeConfidence(numeric);
  if (text.includes("high") || text.includes("alta")) return "high";
  if (text.includes("medium") || text.includes("media")) return "medium";
  if (text.includes("low") || text.includes("baja")) return "low";
  return "low";
}

const profileSchema = z.object({
  name: requiredText(researchConfig.validation.nameMaxLength, researchConfig.validation.minimumTextLength),
  country: requiredText(researchConfig.validation.countryMaxLength),
  party: requiredText(researchConfig.validation.partyMaxLength),
  position: requiredText(researchConfig.validation.positionMaxLength),
  tenure: z.preprocess(modelText, z.string().trim().max(researchConfig.validation.tenureMaxLength)),
  salary: z.preprocess(modelText, z.string().trim().max(researchConfig.validation.salaryMaxLength)),
  confidence: z.preprocess(normalizeConfidence, z.enum(["high", "medium", "low"])),
  spectrum: optionalSpectrum,
  summary: requiredText(researchConfig.validation.summaryMaxLength),
  offices: z.preprocess((value) => value === null ? undefined : value, z.array(z.object({ title: requiredText(researchConfig.validation.itemTitleMaxLength, researchConfig.validation.minimumTextLength), startDate: requiredText(researchConfig.validation.itemDateMaxLength), endDate: optionalText(researchConfig.validation.itemDateMaxLength), status: statusSchema, source: optionalText(researchConfig.validation.itemSourceMaxLength), sourceUrl: optionalSourceUrl, permanent: optionalBoolean })).max(researchConfig.validation.collectionMaxItems).default([])),
  laws: z.preprocess((value) => value === null ? undefined : value, z.array(researchItemSchema).max(researchConfig.validation.collectionMaxItems).default([])),
  allegations: z.preprocess((value) => value === null ? undefined : value, z.array(researchItemSchema).max(researchConfig.validation.collectionMaxItems).default([])),
  highlights: z.preprocess((value) => value === null ? undefined : value, z.array(researchItemSchema).max(researchConfig.validation.collectionMaxItems).default([])),
});

const demoProfile: PoliticianProfile = {
  slug: "alexandria-ocasio-cortez",
  name: "Alexandria Ocasio-Cortez",
  country: "United States",
  party: "Democratic Party",
  position: "U.S. Representative, NY-14",
  tenure: "Serving since January 3, 2019",
  salary: "$174,000 / year",
  lastUpdated: "November 2, 2026",
  confidence: "high",
  spectrum: { x: -55, y: 20 },
  summary: "A member of the U.S. House of Representatives representing parts of the Bronx and Queens. This sample record demonstrates the research format before an Azure credential is configured.",
  offices: [{ title: "U.S. Representative, NY-14", startDate: "January 3, 2019", status: "verified", source: "House.gov", sourceUrl: "https://ocasio-cortez.house.gov/", permanent: true }],
  laws: [
    { title: "Green New Deal", summary: "Introduced H. Res. 109, a non-binding resolution outlining a national climate and jobs framework.", status: "verified", date: "2019", source: "Congress.gov", sourceUrl: "https://www.congress.gov/bill/116th-congress/house-resolution/109" },
    { title: "Justice for All Act", summary: "Sponsored legislation focused on expanding access to legal representation and public defenders.", status: "reported", date: "2023", source: "Congress.gov", sourceUrl: "https://www.congress.gov/" },
  ],
  allegations: [
    { title: "Campaign finance complaint", summary: "A complaint was filed with the Federal Election Commission; the public record does not establish a finding of wrongdoing.", status: "disputed", date: "2022", source: "FEC records", sourceUrl: "https://www.fec.gov/" },
  ],
  highlights: [
    { title: "Committee assignments", summary: "Serves on the House Committee on Energy and Commerce and the Committee on Oversight and Accountability.", status: "verified", source: "House.gov", sourceUrl: "https://ocasio-cortez.house.gov/" },
    { title: "Public positions", summary: "Known for advocacy around climate policy, labor rights, and expanded social programs.", status: "reported", source: "Public statements" },
  ],
};

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseModelProfile(content: unknown): Record<string, unknown> {
  if (typeof content !== "string" || !content.trim()) throw new Error("Azure returned an empty research response");
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Azure returned no complete JSON object");
  try {
    return JSON.parse(normalized.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("Azure returned malformed or truncated JSON");
  }
}

function mergePermanentFacts(previous: PoliticianProfile | undefined, next: PoliticianProfile): PoliticianProfile {
  if (!previous) return next;
  const key = (value: { title?: unknown; startDate?: unknown; date?: unknown }) => `${String(value.title ?? "").toLowerCase()}|${String(value.startDate ?? value.date ?? "").toLowerCase()}`;
  const permanentOffices = (previous.offices ?? []).filter((office) => office.permanent === true);
  const permanentItems = (items: typeof previous.laws) => items.filter((item) => item.permanent === true);
  const merge = <T extends { title?: unknown; startDate?: unknown; date?: unknown }>(current: T[] | undefined, preserved: T[]) => {
    const merged = [...(current ?? [])];
    for (const item of preserved) if (!merged.some((candidate) => key(candidate) === key(item))) merged.push(item);
    return merged;
  };
  return {
    ...next,
    offices: merge(next.offices, permanentOffices),
    laws: merge(next.laws, permanentItems(previous.laws)),
    allegations: merge(next.allegations, permanentItems(previous.allegations)),
    highlights: merge(next.highlights, permanentItems(previous.highlights)),
  };
}

export async function findPortrait(name: string, language: "en" | "es") {
  try {
    const wiki = language === "es" ? "es" : "en";
    const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
    const direct = await fetch(`https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${title}`, { next: { revalidate: researchConfig.portrait.revalidateSeconds } });
    if (direct.ok) return (await direct.json()).thumbnail?.source as string | undefined;
    const search = await fetch(`https://${wiki}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`, { next: { revalidate: researchConfig.portrait.revalidateSeconds } });
    const result = search.ok ? await search.json() : undefined;
    const fallbackTitle = result?.query?.search?.[0]?.title;
    if (!fallbackTitle) return undefined;
    const fallback = await fetch(`https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(fallbackTitle)}`, { next: { revalidate: researchConfig.portrait.revalidateSeconds } });
    return fallback.ok ? (await fallback.json()).thumbnail?.source as string | undefined : undefined;
  } catch {
    return undefined;
  }
}

export async function researchPolitician(name: string, language: "en" | "es" = "en", previousProfile?: PoliticianProfile, reportContext?: { issue: string; sourceUrl: string }): Promise<PoliticianProfile> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    if (process.env.NODE_ENV === "production") throw new Error("Research provider credentials are not configured");
    const fallbackProfile = { ...demoProfile, name: name.trim() || demoProfile.name, slug: slugify(name || demoProfile.name), imageUrl: await findPortrait(name || demoProfile.name, language) ?? previousProfile?.imageUrl, lastUpdated: new Date().toLocaleDateString(language === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" }) };
    return mergePermanentFacts(previousProfile, fallbackProfile);
  }

  const isFoundryEndpoint = endpoint.includes(".services.ai.azure.com");
  const url = isFoundryEndpoint
    ? `${endpoint.replace(/\/$/, "")}/openai/v1/chat/completions`
    : `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${researchConfig.model.azureApiVersion}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      ...(isFoundryEndpoint ? { model: deployment, max_completion_tokens: researchConfig.model.foundryMaxCompletionTokens } : { temperature: researchConfig.model.temperature }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a careful political research assistant. Return only JSON matching the requested fields. Separate verified facts from reported, disputed, dismissed, and unknown claims. Never present accusations as convictions. Treat a case, complaint, or charge as dismissed only when a reliable source explicitly says it was dismissed, rejected, dropped, withdrawn, closed without action, or otherwise resolved without a finding of liability. Use disputed only when the claim or account remains contested and has not been resolved. Mark permanent true only for confirmed historical offices, enacted laws, and finalized legal outcomes that should be retained across future refreshes. Mark permanent false for current roles, open allegations, developing cases, and other facts that may change. For every source, provide both a human-readable source name and the direct sourceUrl when a reliable URL is available." },
        { role: "system", content: `Spectrum rubric: x=${researchConfig.validation.spectrumMin} is progressive and x=${researchConfig.validation.spectrumMax} is conservative; y=${researchConfig.validation.spectrumMin} is libertarian and y=${researchConfig.validation.spectrumMax} is authoritarian. Treat x and y as independent dimensions. Do not treat liberal as a synonym for authoritarian: economic or classical liberalism, free-market positions, and reducing the size of the state generally move y toward libertarian. Positive authoritarian y values require separate documented support for coercive state power, centralized control, political repression, or comparable limits on civil liberties. Cultural conservatism alone does not justify a positive authoritarian y value. A documented liberal-conservative profile will usually be rightward on x and below the horizontal midpoint on y unless there is separate evidence of authoritarianism.` },
        { role: "system", content: "Policy evidence rubric: laws must cover concrete legislative or public-policy actions and proposals, not only general ideology or controversy. Search the available public record for reputable news articles and primary sources about items such as taxes raised or lowered, public works and infrastructure, budgets and spending adjustments, regulation, social programs, labor policy, trade, education, health, energy, security, and bills sponsored, introduced, passed, vetoed, or implemented. Include a concise item when the politician directly sponsored, voted on, proposed, announced, negotiated, or materially influenced it. Use reported for a reputable article describing an action when primary confirmation is unavailable, verified for a directly supported enacted or documented action, and unknown when the evidence is insufficient. Do not invent article details, votes, dates, outcomes, or causal influence; omit an item rather than relying on a vague homepage or an unsourced claim. Prefer a direct article URL or official bill, budget, agency, or legislative URL for every item." },
      ...(reportContext ? [{ role: "system" as const, content: `An administrator approved a public correction report for additional research. Evaluate this claim against the source and the available public record, then update only the profile fields and research items supported by it. Treat the source as temporarily trusted for this review, but do not invent details or present the claim as verified if the source does not support it. Reported claim: ${reportContext.issue}. Source URL: ${reportContext.sourceUrl}` }] : []),
        { role: "user", content: `Research the current public record for this politician: ${name}. Return a JSON object with name, country, party, position, tenure, salary, summary, confidence, spectrum, offices, laws, allegations, and highlights. spectrum is an object with numeric x and y coordinates from ${researchConfig.validation.spectrumMin} to ${researchConfig.validation.spectrumMax}: x=${researchConfig.validation.spectrumMin} is progressive and x=${researchConfig.validation.spectrumMax} is conservative; y=${researchConfig.validation.spectrumMin} is libertarian and y=${researchConfig.validation.spectrumMax} is authoritarian. Estimate the spectrum only from the politician's documented public positions and label confidence based on the available evidence; if the evidence is insufficient, omit spectrum. IMPORTANT: offices is required and must always be a non-empty array, even when some dates or sources are unknown. It is a chronological timeline of every public office held that you can verify; each item has title, startDate, endDate (omit when current), status (verified, reported, disputed, dismissed, unknown), permanent, source, and sourceUrl. Each laws, allegations, and highlights item has title, summary, status (verified, reported, disputed, dismissed, unknown), permanent, date, source, and sourceUrl. sourceUrl must be a direct http or https link to the page supporting that specific fact, not a homepage when a specific page is available. For allegations and charges, check for recent procedural outcomes such as dismissal, acquittal, withdrawal, or closure before assigning disputed. Do not infer an unresolved allegation from an old report when a later reliable source records its dismissal. Be explicit when information is unknown. ${previousProfile ? `These facts were previously confirmed as permanent and must be retained unless a new source directly corrects them: ${JSON.stringify({ offices: previousProfile.offices?.filter((office) => office.permanent), laws: previousProfile.laws.filter((item) => item.permanent), allegations: previousProfile.allegations.filter((item) => item.permanent), highlights: previousProfile.highlights.filter((item) => item.permanent) })}` : "There is no previous profile to preserve."} Respond entirely in ${language === "es" ? "Spanish" : "English"}.` },
      ],
    }),
  });
  if (!response.ok) {
    await response.text();
    console.error(`Azure research request failed (${response.status})`);
    throw new Error(`Azure research request failed (${response.status})`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  let profile: Record<string, unknown>;
  try {
    profile = parseModelProfile(content);
  } catch (error) {
    console.error("Azure returned an unusable research payload", { error, finishReason: data.choices?.[0]?.finish_reason, contentType: typeof content });
    throw new Error("The research provider returned an incomplete response. Please try again.");
  }
  const profileName = typeof profile.name === "string" ? profile.name : name;
  const validatedProfile = profileSchema.parse(profile);
  const nextProfile = { ...validatedProfile, imageUrl: await findPortrait(profileName, language) ?? previousProfile?.imageUrl, slug: slugify(profileName), lastUpdated: new Date().toLocaleDateString(language === "es" ? "es-ES" : "en-US", { year: "numeric", month: "long", day: "numeric" }) } as PoliticianProfile;
  return mergePermanentFacts(previousProfile, nextProfile);
}
