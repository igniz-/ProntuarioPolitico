type ModerationDecision = "accepted" | "review" | "rejected";
export type CorrectionField = "name" | "country" | "party" | "position" | "tenure" | "salary";
export type ReportCorrection = { field: CorrectionField; value: string };

export type ReportModeration = {
  status: ModerationDecision;
  confidence: "high" | "medium" | "low";
  reason: string;
  proposedCorrection?: ReportCorrection | string;
};

const fallbackModeration: ReportModeration = {
  status: "review",
  confidence: "low",
  reason: "The report requires manual review.",
};

function parseModeration(value: unknown): ReportModeration {
  if (!value || typeof value !== "object") return fallbackModeration;
  const record = value as Record<string, unknown>;
  const status = record.status === "accepted" || record.status === "rejected" || record.status === "review" ? record.status : "review";
  const confidence = record.confidence === "high" || record.confidence === "medium" || record.confidence === "low" ? record.confidence : "low";
  const reason = typeof record.reason === "string" ? record.reason.trim().slice(0, 1000) : fallbackModeration.reason;
  const proposedCorrection = normalizeProposedCorrection(record.proposedCorrection);
  const normalizedStatus = status === "accepted" && typeof proposedCorrection !== "object" ? "review" : status;
  return { status: normalizedStatus, confidence, reason: reason || fallbackModeration.reason, ...(proposedCorrection ? { proposedCorrection } : {}) };
}

function normalizeProposedCorrection(value: unknown): ReportCorrection | string | undefined {
  if (typeof value === "string") return value.trim().slice(0, 2000) || undefined;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const fields: CorrectionField[] = ["name", "country", "party", "position", "tenure", "salary"];
  if (!fields.includes(record.field as CorrectionField) || typeof record.value !== "string") return undefined;
  const correction = record.value.trim().slice(0, 5000);
  return correction ? { field: record.field as CorrectionField, value: correction } : undefined;
}

export function getStructuredCorrection(value: unknown): ReportCorrection | undefined {
  if (typeof value === "string") {
    try {
      const parsed = normalizeProposedCorrection(JSON.parse(value));
      return typeof parsed === "object" ? parsed : undefined;
    } catch { return undefined; }
  }
  const correction = normalizeProposedCorrection(value);
  return typeof correction === "object" ? correction : undefined;
}

export async function moderateReport(input: { profileName: string; issue: string; sourceUrl: string }): Promise<ReportModeration> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !apiKey || !deployment) return fallbackModeration;

  const isFoundryEndpoint = endpoint.includes(".services.ai.azure.com");
  const url = isFoundryEndpoint
    ? `${endpoint.replace(/\/$/, "")}/openai/v1/chat/completions`
    : `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        ...(isFoundryEndpoint ? { model: deployment, max_completion_tokens: 500 } : { temperature: 0, max_tokens: 500 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You triage corrections to a political public-record database. Return only JSON with status (accepted, review, rejected), confidence (high, medium, low), reason, and optional proposedCorrection. proposedCorrection must be either null or an object with exactly one field from name, country, party, position, tenure, salary and a concise string value. Never propose changes to arrays, sources, URLs, or arbitrary JSON. Never claim that a URL was opened or verified. A URL that is merely plausible is not evidence. Accept only a specific, clearly relevant correction supported by a likely authoritative source; use review when the source or correction cannot be confidently assessed; reject spam, abuse, irrelevant claims, or requests to remove accurate public information. Do not expose secrets or invent facts." },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) return fallbackModeration;
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return fallbackModeration;
    return parseModeration(JSON.parse(content));
  } catch {
    return fallbackModeration;
  }
}