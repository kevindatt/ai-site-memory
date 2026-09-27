# AI Site Memory — OpenCode Project Instructions

## Product context

AI Site Memory is a construction-project intelligence product. Phase 1 is an AI Status Desk that answers project questions using authoritative project records and source evidence.

## Core engineering principles

1. Evidence-first AI: the model must not be treated as the source of truth.
2. Never fabricate project status, dates, responsible parties, revisions or reasons.
3. Every factual chat response should be traceable to retrieved project records or source-document evidence.
4. Permission checks must happen before retrieval reaches the model.
5. Keep ingestion, normalization, retrieval, relationship resolution and response generation modular.
6. Prefer simple maintainable code over premature abstraction.
7. Use TypeScript strict mode.
8. Add tests for core logic and evaluation cases.
9. Use synthetic/demo project data only in this public repository.
10. Never commit secrets; use environment variables and `.env.example`.

## Product scope guardrail

Do not build autonomous project actions, Aconex write-back, WhatsApp, predictive analytics, BIM reasoning or full project-management functionality unless the PRD is updated first.

## Coding workflow

Before implementing a feature:

- read the relevant PRD section;
- state the acceptance criteria you are implementing;
- make the smallest change that satisfies them;
- run the relevant tests;
- update documentation when behavior changes;
- if a product/design decision changes from the PRD, record the steering change and reason in the PRD's `Agent Steering & Design Change Log`.
