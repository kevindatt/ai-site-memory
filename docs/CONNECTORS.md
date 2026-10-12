# Data Source Connectors — Architecture & Readiness

**Status:** Local folder IMPLEMENTED · OneDrive / Google Drive / Aconex / Egnyte PLANNED
**Rule:** No connector is claimed as implemented unless it exists, is tested, and reads only user-authorised content. No secrets in code or git — ever.

## 1. Common interface (implemented)

All sources share one lifecycle so the chatbot never talks to a source
system directly (`src/connectors/source.ts`):

`connect → list → refresh → markStale → disconnect`

- Retrieval sees only normalized records plus connection state.
- A source that loses authorization must **disconnect** (removing its
  imported content) rather than serve stale data as current.
- Every import, refresh, failure and disconnect is audit-logged.
- `DocumentSource` (`src/lib/retrieval.ts`) stays the read boundary behind
  all of the above; `FolderScan` + `mergeSources` is the file-ingest path.

Status by source:

| Source | State | How it works today |
|---|---|---|
| Synthetic bundle | Implemented, tested | Built-in CSVs under `data/test-project/` |
| Local files / folder | Implemented, tested | User picks CSV/XLSX/MD/TXT/PDF files; header detection, cleaning, diagnostics, refresh, per-file report; 25 MB per-file cap |
| OneDrive | Planned | Design below — needs Entra app + user consent |
| Google Drive | Planned | Design below — needs Cloud project + OAuth consent |
| Aconex | Planned | Design below — needs Oracle-registered integration + project access |
| Egnyte | Planned | Design below — needs developer app key + OAuth |

## 2. Local folder (implemented)

- User-selected files only — the app never implies it can read arbitrary
  files; browser security is respected (explicit file picker, session-only).
- Supported: CSV (RFC-4180), XLSX (SheetJS, header variants, serial dates),
  MD/TXT notes with `Records:` tags, PDFs indexed by name only.
- Refresh re-reads the same picked files and reports row-count deltas with a
  timestamp; stale/failed imports are labelled, never presented as current.
- Unsupported, oversized (>25 MB), or malformed files are refused with a
  clear message; unknown columns are reported, never silently dropped.
- Limitation (documented): picked files live for the browser session only —
  no persistent folder permission is retained. Re-pick after reload.

## 3. OneDrive (planned — design only)

- **Approach:** Microsoft Graph + MSAL browser flow; user signs in and picks
  an authorised folder (drive picker). Read-only `Files.Read.Selected`
  (least privilege) + `offline_access` for refresh tokens — never broad
  `Files.ReadWrite.All` without written justification.
- **Prerequisites:** App registration in Microsoft Entra (tenant of the
  company); redirect URI for the Netlify origin; administrator consent if the
  tenant requires it for the chosen scopes. None of these exist yet — do NOT
  assume tenant access or admin consent.
- **Behaviour:** list folders/files via delta queries; download only required
  CSV/XLSX/PDF; store tokens server-side or in a secure backend session —
  never in frontend code, localStorage, or git; handle revoked consent,
  expired tokens, and unavailable files as disconnects (stale, not silent).
- **Implementation steps when authorised:** (1) Entra app + scopes approved;
  (2) MSAL login + drive picker UI; (3) `SourceConnector` adapter mapping
  Graph deltas to `FolderScan`; (4) refresh scheduler + audit events;
  (5) tests with recorded (redacted) fixtures.

## 4. Google Drive (planned — design only)

- **Approach:** Google Drive API + OAuth 2.0; `drive.file` scope (only files
  the app creates or the user explicitly opens — least privilege), escalating
  to `drive.readonly` only with justification; Drive picker for folder
  selection; token refresh with expiry handling.
- **Prerequisites:** Google Cloud project, OAuth consent screen (external vs
  internal user type decision), authorized redirect URIs, and — for
  production — app verification if sensitive scopes are used. None exist yet.
- **Behaviour:** same lifecycle as §1; revoked permissions, expired tokens,
  failed syncs and unavailable files all surface as disconnect/stale states
  with user-facing messages; shared-drive membership must be checked before
  listing.
- **Implementation steps when authorised:** (1) Cloud project + consent
  screen; (2) OAuth + picker UI; (3) `SourceConnector` adapter;
  (4) refresh + audit events; (5) redacted-fixture tests.

## 5. Aconex (planned — vision preserved, not authorised)

- **What the product wants:** search accessible Aconex project folders and
  surface the latest relevant records with the user's own permissions.
- **API reality (investigated Oct 2026):** Oracle exposes REST APIs
  (Documents, Workflows, Projects) through the Oracle Smart Construction
  Platform Lobby OAuth (`https://api.aconex.com` resource server); OAuth is
  Oracle's required direction — Basic Auth and Integration IDs are being
  retired (~2027). **Every integration must be registered with Oracle**;
  customers building internal tools register as customer integrations, while
  commercial offerings require Oracle PartnerNetwork membership. The
  authorizing user must be on the project, and Web Services must be enabled
  for that project — calls otherwise fail with project/user access errors.
- **What we lack:** no Oracle-registered integration, no project API
  enablement, no administrator approvals. The user currently has no Aconex
  API access.
- **Non-negotiable rules:** respect the logged-in user's existing project
  permissions (Aconex enforces them server-side — never work around them);
  no credential storage outside a proper secret store; no scraping of
  protected content; never claim the connector works until it is built AND
  tested against a real project the user can access.
- **Implementation steps when authorised:** (1) register the integration
  (customer path) and confirm project API enablement; (2) Lobby OAuth login
  selecting the user's Aconex account; (3) read-only Documents/Workflows
  adapters into normalized records with source IDs and timestamps;
  (4) permission-aware refresh + audit; (5) pilot against one authorised project.

## 6. Egnyte (planned — vision preserved, not authorised)

- **What the product wants:** read authorised Egnyte project folders/files
  as an evidence source with the same lifecycle as §1.
- **API reality (investigated Oct 2026):** Egnyte Public API is REST+JSON
  over OAuth 2.0 (`{domain}.egnyte.com/pubapi`). Internal (customer-built)
  apps use the Resource-Owner flow; public/partner apps use Authorization
  Code (server-side, recommended) — **Egnyte's own guidance forbids storing
  tokens in browser localStorage** — so a server-side component is required
  for anything beyond a prototype. An API key needs a developer account tied
  to a domain-admin email; production use beyond the registered domain needs
  approval; API rate limits (~2 QPS default) apply.
- **What we lack:** no developer account, no API key, no authorised domain.
- **Non-negotiable rules:** server-side token handling only; least-privilege
  scopes; respect folder permissions; no scraping; never claim it works
  until built AND tested.
- **Implementation steps when authorised:** (1) developer account + API key;
  (2) server-side OAuth + File System API adapter (list/search/download);
  (3) refresh + audit; (4) rate-limit-respecting sync; (5) redacted tests.

## 7. Security requirements the current architecture cannot fully enforce

- True secret storage needs a backend (Netlify Functions or equivalent) —
  until then, cloud connectors stay at design stage rather than shipping
  token handling the browser cannot protect.
- Enterprise permission mapping is currently a local CSV stand-in
  (`access-control.csv`); production must bind it to IdP/SSO groups.
- PDF content extraction is not implemented (name-only indexing); answers
  must keep saying so where relevant.
- Long-term retention/deletion policy for imported content is undecided —
  session-only today, which is the safest default.
