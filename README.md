# Prontuario Politico

A source-aware political research desk. Search a public official and receive a cached brief covering their role, tenure, salary, legislative record, allegations, and highlights.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Azure setup

Copy `.env.example` to `.env.local` and add an Azure OpenAI endpoint, API key, and deployment name. The research request runs only on the server. In development, missing credentials use a clearly marked sample record; production fails closed until the provider is configured.

Research is cached in SQLite under `data/prontuario.db`. Set `CACHE_TTL_HOURS` in `.env.local` to control how many hours cached research remains valid; it defaults to 24. For production, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to use a hosted libSQL database.

Research validation limits, confidence thresholds, portrait revalidation, and Azure request settings are centralized in `src/lib/research-config.ts`. These are application settings rather than user-provided request parameters.

## Translations

User-facing research desk copy lives in `src/lib/i18n/`, with one catalog per language and shared types in `types.ts`. Add a language by creating its catalog, registering it in `src/lib/i18n/index.ts`, and extending the `Language` union. The UI reads translations through `getTranslation()` rather than defining strings inside components.

## Production checklist

- Rotate any Azure key that has been exposed outside the deployment secret manager, then store the replacement only in the host's encrypted environment settings.
- Use Turso or another persistent libSQL database for multi-instance or serverless hosting; do not rely on the local SQLite file for production durability.
- Put a platform or edge rate limit in front of `/api/research` and `/api/reports`. The application includes a best-effort per-instance limit, but it is not a substitute for a distributed gateway limit.
- Report submissions are limited to three per IP per 24 hours, deduplicated by politician and source for 24 hours, and triaged with a bounded Azure request. AI triage may propose structured scalar corrections; administrators approve or reject them before any cached profile is changed. Approving a report without a structured correction reruns the normal research flow with the administrator-approved claim and source as review context.
- Deploy behind HTTPS and verify the configured security headers, provider secret scope, backups, logs, and report moderation process.

## Admin panel and analytics

Set `ADMIN_TOKEN` in the deployment secret manager and open `/admin` to sign in. The token is exchanged for a short-lived HttpOnly cookie; it is never stored in the browser or sent in the URL. Set `ADMIN_SESSION_SECRET` to a separate high-entropy value in production to sign the session cookie.

The panel reports visits, daily unique visitors, average session duration, popular paths, and successful profile-link copies. Analytics stores event timestamps, session IDs, and a daily keyed hash of the request IP; raw IP addresses are not persisted. Set `ANALYTICS_HASH_SECRET` to a separate high-entropy value and configure the database retention policy appropriate for your deployment.

Rejected reports remain in the database as moderation history but disappear from the pending queue. Approved structured reports apply an allowlisted scalar field such as `position`, `tenure`, or `salary`; approved plain-language reports rerun the research model with the submitted claim and source URL, and the resulting schema-validated profile replaces the relevant cache. Arbitrary JSON patches, source changes, and array edits are not applied automatically.

## Politician registry

Autocomplete reads the lightweight discovery registry from the `politician_registry` table in SQLite/libSQL. Registry records contain identity and directory metadata only, and selecting one still runs the normal source-aware research flow. The JSON seed registry is no longer used.

Check registry sources and refresh Wikimedia portraits without AI extraction:

```bash
npm run registry:check
npm run registry:refresh
```

The refresh command is suitable for a later system cron job. It validates each source URL, refreshes Wikipedia thumbnails when the record uses a Wikipedia source, discovers current legislative members through bounded Wikidata `P39` position queries and official structured directories, and upserts records directly into SQLite/libSQL. The initial country rollout covers Ireland, the United States, the United Kingdom, Canada, Spain, Mexico, Argentina, Colombia, and Australia. These sources are intentionally bounded and should not be treated as completeness claims while coverage is being expanded. The command preserves records whose source is temporarily unavailable.

Discovery sources are configured in `data/registry-sources.json`. Wikidata sources use bounded `P39` position-list queries, exclude statements with an end date, and add candidates with their Wikidata URL, country, region, position, district, and optional Commons image. Argentina also uses the official Senate JSON export, the official HCDN CSV export, and the ReFeGLo CSV published through Datos Argentina. ReFeGLo supplies local government authorities and is refreshed on an eventual schedule, so those records should be treated as directory leads and verified against the local government's current site. New source types should get an explicit parser in `scripts/refresh-registry.mjs`; avoid adding generic HTML scraping when a structured endpoint is available.

For a cron entry, run the command from the project directory, for example:

```cron
15 3 * * 1 cd /path/to/ProntuarioPolitico && npm run registry:refresh >> data/registry-refresh.log 2>&1
```
