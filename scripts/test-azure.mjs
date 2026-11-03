const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();

if (!endpoint || !apiKey || !deployment) {
  const missing = [
    ["AZURE_OPENAI_ENDPOINT", endpoint],
    ["AZURE_OPENAI_API_KEY", apiKey],
    ["AZURE_OPENAI_DEPLOYMENT", deployment],
  ].filter(([, value]) => !value).map(([name]) => name);
  console.error(`Azure configuration is incomplete. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

let parsedEndpoint;
try {
  parsedEndpoint = new URL(endpoint);
  if (!['http:', 'https:'].includes(parsedEndpoint.protocol)) throw new Error("unsupported protocol");
} catch {
  console.error("AZURE_OPENAI_ENDPOINT must be a valid HTTP or HTTPS URL.");
  process.exit(1);
}

const isFoundryEndpoint = endpoint.includes(".services.ai.azure.com");
const url = isFoundryEndpoint
  ? `${endpoint.replace(/\/$/, "")}/openai/v1/chat/completions`
  : `${endpoint.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`;
const body = {
  messages: [{ role: "user", content: "Reply with exactly OK." }],
  ...(isFoundryEndpoint ? { model: deployment, max_completion_tokens: 8 } : { temperature: 0, max_tokens: 8 }),
};
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);

try {
  console.log(`Testing Azure ${isFoundryEndpoint ? "Foundry" : "OpenAI"} endpoint at ${parsedEndpoint.host}...`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  if (!response.ok) {
    await response.text();
    console.error(`Azure request failed with HTTP ${response.status}. Check the endpoint, deployment, API version, and rotated key.`);
    process.exit(1);
  }
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error("Azure returned HTTP 200 but no assistant message was found.");
    process.exit(1);
  }
  console.log(`Azure request succeeded. Model response: ${JSON.stringify(content)}`);
} catch (error) {
  const message = error?.name === "AbortError" ? "request timed out after 15 seconds" : "network or TLS error";
  console.error(`Azure request could not be completed: ${message}.`);
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
