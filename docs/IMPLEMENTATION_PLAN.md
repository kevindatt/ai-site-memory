# AI Site Memory — Implementation Plan

**Status:** Living document · updated after the first working Ask-the-Project prototype
**Source of truth:** `docs/PDD.md` (approved discovery) and `docs/PRD.md` (requirements, roadmap, steering log)
**Build reference:** `docs/TECHNICAL_BUILD_SPEC.md`
**Constraints:** Local-first prototype · synthetic data only (`data/test-project/`) · React + Vite + TypeScript strict (per PRD Steering change 05) · no external AI APIs, connectors, auth, payments, or deployment until the PRD authorizes them

---

## 1. Where we stand (completed)

| # | Milestone | Output | Verified by |
|---|-----------|--------|-------------|
| 0 | Phase-0 scaffold | React + Vite + TS strict shell; modular boundaries `access → retrieval → relationships → respond`; `DocumentSource` adapter interface; demo-user access check | `typecheck`, `build`, scaffold tests (3 passing) |
| 1 | Visual design preview (`design.html`, root) | Enterprise construction-software direction: navy header, blue primary action, gold accent, register-gray ground; Ask input, sample WIR-1842 answer, status/related/evidence/disclaimer | Browser review |
| 2 | Design refinements | Prominent Ask button + status hierarchy (PRD log 06); Aconex-inspired enterprise theme (PRD log 07) | Browser review |
| 3 | Working Ask-the-Project page | CSV-backed `ProjectStore` (CSVs stay source of truth); deterministic answer engine covering status, holder, NCR relations, latest approved drawing, overdue, history, why-pending, veneer clarification + resolution, timber/Cafe, wall-colour and unknown handling; verification badges; evidence lists; AI-mistakes disclaimer | `typecheck` ✅ · `build` ✅ · 14/14 tests ✅ · HTTP 200 at `localhost:5173` ✅ |

**Key files:** `src/data/registers.ts`, `src/lib/{types,access,retrieval,relationships,respond}.ts`, `src/App.{tsx,css}`, `src/ask.test.ts`, `design.html`

### Phases A & B — executed

| Step | What was built | Verified |
|------|---------------|----------|
| A1 | `src/data/diagnostics.ts` (counts, required fields, duplicates, dates, dangling links vs external-ref warnings); `scripts/ingest.ts` + `npm run ingest` (fails loudly); completed 2 genuinely dangling drawing refs in the fixture (AR-L2-014-Rev-A, AR-CAFE-007-Rev-A) | `ingest` OK; 4 diagnostics tests |
| A2 | `Submittal_Register.csv` (SUB-118/119/120 linked to MIRs); `DOC-001`/`DOC-002` source notes with explicit record tags; `src/data/documents.ts`; submittals + documents wired into MIR/WIR/timber answers as evidence | 45/45 tests; answers show new evidence |
| A3 | `src/eval/cases.ts` (12 cases mapped to UC-01–UC-11/AC-10) + `npm run eval` + `eval.test.ts` | eval 12/12 |
| A4 | `UserContext.scope`, `USERS` (full demo user + Villa-43-restricted site viewer), `applyScope()` enforced inside the engine pre-retrieval, access-denied answers, acting-as switcher in UI | 5 access tests |
| B1 | `src/data/pipeline.ts` (`load/reloadProjectData` = re-ingestion + validation) | 2 pipeline tests |
| B2 | `src/lib/budget.ts` (8-ref cap, token estimates, per-answer usage); `keywordSearch` fallback labeled Inferred (skipped for named-but-unknown ids); unrecorded-communication intent for UC-10 fidelity | 7 platform tests |
| B3 | `getRevisionLineage()` shown on drawing answers; `inferBySharedLocation()` labeled inferred (timber → RFI-078) | covered by ask/eval cases |
| B4 | `src/lib/precedence.ts` (Approved-only → latest date → higher revision); retrieval delegates to it | superseded-newer + tie-break tests |
| B5 | `src/lib/aiProvider.ts` (`AIProvider`, offline `DeterministicProvider`, vendor-neutral `HttpLlmProvider`) + `aiConfig.ts` (deterministic default; HTTP only when fully configured) — engine stays deterministic; no vendor SDKs, no network calls | provider tests |

### Phase C — executed API-free (no enterprise permissions available)

Enterprise APIs were unavailable, so C1–C3 were built as local-file connectors: same interfaces, zero network calls, reading the user's own exports/folders.

| Step | What was built | Verified |
|------|---------------|----------|
| C1/C2/C3 | `src/connectors/localFiles.ts` (`FolderScan`, filename-keyword → `CsvBundle` mapping, pdf/xlsx/other classification); `src/connectors/xlsx.ts` cleaning step (sheet detection, header-variant mapping, date/empty-row cleaning, reported-not-guessed gaps; explicit CSVs win); `ProjectStore` accepts any CSV bundle; in-app **Load local files** picker (session store + diagnostics note + reset); `npm run ingest -- --source <folder>` validates external folders | 7 connector tests (incl. xlsx); live `--source` scan OK; messy-header workbook proven end-to-end |
| C4 | `data/test-project/access-control.csv` drives `USERS`/scopes (stand-in for enterprise permission mapping); `src/lib/audit.ts` local audit log (browser storage + memory fallback, nothing leaves the machine); audit panel in UI with allow/deny entries + clear | governance tests; 50/50 total tests, eval 12/12 |

### Phase D — executed (local, no external systems)

| Step | What was built | Verified |
|------|---------------|----------|
| D1 | `src/lib/timeline.ts` — documented per-record timelines for every kind (WIR-1842 keeps its reject–resubmit workflow; drawings get revision lineage answering “what changed”); undated parts stay explicit | timeline tests; UC-06b eval case |
| D2 | `src/lib/intelligence.ts` — counts (“how many open NCRs?”, “show draft MIRs”), holder workload, exception findings (overdue, bottlenecks, drafts, pending approvals, rework risk) labeled Inferred, plus project summaries | attention/count/summary tests; UC-07 + D2 eval cases |
| D3 | `src/lib/watchers.ts` — 4 opt-in exception watchers evaluated on demand with new-since-acknowledged highlighting; Monitoring panel with record chips + acknowledge | watcher tests |
| D4 | `src/lib/actions.ts` — propose → approve/reject → execute lifecycle; execution requires recorded approval and is simulated locally with an explicit note; chat commands (`approve ACT-x`) + Actions panel buttons; every transition audit-logged; no autonomous execution anywhere | lifecycle + chat tests |

---

## 2. Tabular build path

Each phase is ordered, gated on the previous phase's acceptance criteria, and ends with `typecheck + build + tests + browser check`.

### Phase A — Harden the prototype (next)

| Step | Scope | Concrete output | Acceptance |
|------|-------|-----------------|------------|
| A1 | Ingestion diagnostics + re-ingestion | `npm run ingest` script: parses all CSVs, reports row counts, missing fields, dangling `related_*` links; fails loudly on malformed data | Diagnostics run green; a deliberately broken CSV copy is flagged |
| A2 | Missing synthetic artifacts | Representative sample PDFs + a Submittal register row-set (still synthetic); document-retrieval stub returns extractable text refs | PDF text appears as evidence for at least one question |
| A3 | Evaluation harness | `src/eval/` question/expected-answer table mapped to PRD UC-01–UC-11 + AC-01–AC-11; `npm run eval` scores pass/fail | ≥ 95% factual accuracy on the eval set; every factual answer carries evidence |
| A4 | Permission model (local) | Second demo user scoped to a subset of records; access-denied path visibly tested | Unauthorized record never reaches the answer engine (test-proven) |

### Phase B — Functional local MVP (PRD Phase 2)

| Step | Scope | Concrete output | Acceptance |
|------|-------|-----------------|------------|
| B1 | Real ingestion pipeline | CSV/XLSX/PDF loaders behind the `DocumentSource` interface; normalized project model (Project → Location → Activity → records → revisions → events) | Same eval set passes against normalized store |
| B2 | Retrieval engine | Exact-ID fast path → structured query → keyword/semantic fallback; token-budget logging per request | Retrieval returns minimal evidence set; budget caps enforced + tested |
| B3 | Relationship engine | Explicit links + revision lineage + shared location/activity/drawing inference, each labeled Verified vs Inferred | Cross-record questions (UC-05/UC-08) answered with labeled inference |
| B4 | Source precedence rules | Documented + implemented ordering: source metadata → datetime → workflow state → revision → approval status | Newest-but-superseded revision never selected (regression test) |
| B5 | AI provider abstraction | Provider interface; Flash-Lite-class cloud model for experiments + local (Ollama) option; evidence-only prompting; no vendor import outside adapter | Swap provider via config; answers identical on fixed evidence set |

### Phase C — Enterprise data connectivity (PRD Phase 3)

| Step | Scope | Concrete output | Acceptance |
|------|-------|-----------------|------------|
| C1 | Aconex connector (authorized, read-only first) | Adapter returning normalized records + source refs | Same UI answers from Aconex-backed project in a sandbox |
| C2 | Excel/Microsoft Graph connector | Register sync from hosted workbooks | Re-ingestion picks up workbook changes |
| C3 | Egnyte connector | File metadata + content retrieval for evidence | PDF evidence links resolve to enterprise files |
| C4 | Permission mapping + audit | Project/user authorization enforced pre-retrieval; access log | Unauthorized access blocked + logged; security review passes |

### Phase D — Intelligence, monitoring, controlled action (PRD Phases 4–6)

| Step | Scope | Concrete output | Acceptance |
|------|-------|-----------------|------------|
| D1 | Timelines + change history | Per-record event timelines; revision diffs | UC-06 style questions answered from event log |
| D2 | Anomaly/bottleneck intelligence | Overdue clusters, repeat-rejection flags, holder bottlenecks | Pilot users confirm usefulness; no autonomous actions |
| D3 | Monitoring + alerts | Overdue/exception watchers, scheduled summaries | Alert accuracy measured; opt-in only |
| D4 | Controlled actions | Prepare → approve → execute with full audit trail (PRD-gated) | No action executes without recorded approval |

### Phase E — in progress (interactive; Netlify)

| Step | Status and notes |
|------|------------------|
| E1 Hosting | ✅ LIVE at **https://ai-site-memory.netlify.app** — static deploy via CLI (`netlify.toml`: build `npm run build`, publish `dist`, SPA redirect, Node 22); site `ai-site-memory` under kevindatt's team; initial 401 was dashboard password protection, now disabled; verified HTTP 200 with product content |
| E2 Auth | Postponed by user decision — pilot keeps the two local demo users; Neon is DB-only (no built-in email login), so email auth needs a separate provider decision later |
| E3 Billing | Deferred — no Paystack account yet; when created, only the `pk_test_…` public key is shared, secret stays with the user |
| E4 Pilot | Next: click-through checklist below |

---

## 3. Deliberately out of scope until the PRD says otherwise

Live Aconex/Egnyte/OneDrive writes, Teams/WhatsApp, production auth/payments/deployment, predictive analytics, BIM/model reasoning, autonomous project actions, real company data or credentials in the repo.

## 4. How to work this plan

1. Take the next open step (currently **A1**).
2. Read the relevant PRD section; state acceptance criteria before coding.
3. Make the smallest change that satisfies them; extend `src/lib/*` boundaries rather than `App.tsx`.
4. Run `typecheck + build + tests (+ eval when it exists)`; verify in the browser.
5. Record genuine product/design steering in the PRD log; record ordinary progress here (§1 table).

---

## 5. Enhancement round: conversational chatbot + real files + PWA (executed, uncommitted)

Validated against the user's real Aconex-style registers in `local-data/Registers`
(6 workbooks: WIR 2629, MIR 757, NCR 88, RFI 1195, Drawing 10013, Submittal 2136 rows).

- Chatbot: pronoun follow-ups, awaiting-review listings, correspondence
  discovery, record comparison with deterministic conflict detection, counts,
  timelines, monitoring, approval-gated simulated actions.
- Real-file engine: RFC-4180 CSV, header-row detection, alias mapping with
  positional rules, location composition, Excel serial/date cleaning,
  revision families (latest wins, stated), verbatim statuses, multi-link
  cells, composite duplicate warnings, 25 MB per-file cap, refresh with
  change deltas, per-file import reports, import timestamps.
- Connectors: common lifecycle interface + local-files implementation;
  OneDrive/Google Drive/Aconex/Egnyte documented as planned with auth,
  scopes, prerequisites and steps (`docs/CONNECTORS.md`). Nothing claimed
  that is not built and tested.
- PWA: manifest, offline-generated icons (192/512/maskable), versioned
  app-shell service worker (never caches documents/tokens/audit),
  production-only registration, served-asset verification green; real-device
  install prompt remains a manual checklist step.
- Known source-data issues (theirs to fix, 4 rows): WIR AFO-SIN-000072 date
  "316-03-2026"; NCRs ALE-NCR-AR-00136, ALE-SNCR-000646, ALE-NCR-ID-00001
  missing opened_date.

### APK plan (not built — future)

The Vite SPA is Capacitor-compatible in principle: install
`@capacitor/core` + `@capacitor/cli`, init with an application ID such as
`com.qubators.aisitememory`, add the Android platform, sync `dist/`, open in
Android Studio and debug-build the APK for sideload testing. Needs: Android
Studio + SDK on a build machine, signing key for anything beyond debug, and
device testing of the file picker, localStorage audit, and offline launch.
No special Android permissions expected.
