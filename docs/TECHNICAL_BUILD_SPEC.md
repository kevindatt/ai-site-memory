# AI Site Memory — Phase-1 Technical Build Specification

## 1. Purpose

Translate the approved PRD into a small, working Phase-1 prototype that demonstrates the core product behavior without requiring live enterprise integrations.

## 2. Phase-1 implementation target

Build a single local web page with:

- project context/selection
- Ask the Project chat interface
- natural-language question input
- construction-specific sample answers
- status information
- related records
- source evidence
- explicit acknowledgement that AI can make mistakes
- clarification handling for ambiguous questions

Use synthetic project data only.

## 3. Recommended low-cost stack

Use the simplest stack that OpenCode can implement reliably.

Preferred prototype approach:

- TypeScript
- React + Vite
- plain CSS or a lightweight component approach
- local JSON/TypeScript data for the first demonstrator
- no production database required
- no live external APIs
- no paid infrastructure required for local operation

The prototype should be structured so that the data-access layer can later be replaced by API/database implementations.

## 4. Phase-1 data model

Represent at least these concepts:

- Project
- WIR
- MIR
- NCR
- RFI
- Submittal
- Drawing
- Document
- Workflow
- Location
- Relationship

Each record should have a stable identifier and enough metadata to support the demonstration questions.

## 5. Demonstration questions

The prototype should support deterministic responses for synthetic data for at least these cases:

1. What is the status of WIR-1842?
2. Who is holding MIR-302?
3. Which NCR is related to WIR-1842?
4. What is the latest approved drawing related to WIR-1842?
5. Show me all overdue WIRs.
6. What happened after WIR-1842 was rejected?
7. Is the MIR for veneer for Townhouse raised?
8. What is the MIR for Timber in Cafe?
9. Is the color of this wall blue or is there a change?
10. Why is WIR-1842 still pending?

Questions 7–9 are important ambiguity/context tests. The application should ask a clarifying question rather than inventing an answer when the supplied context is insufficient.

## 6. Answer contract

A factual answer should, where applicable, include:

- direct answer/status
- key metadata
- related records
- source/evidence references
- uncertainty state

Use explicit states such as:

- Verified from available project records
- Inferred from available project records
- Cannot verify from available project records
- Clarification required

## 7. AI boundary

For the local prototype, deterministic retrieval and response data is acceptable. Do not pretend that a real production LLM or live connector exists when it does not.

The architecture must keep these concerns separate:

`retrieval -> relationship resolution -> response generation`

The future AI layer will operate on retrieved evidence rather than treating the model as the authoritative source.

## 8. Security boundary

Do not use real ALEC or other company project data. Do not include API keys or credentials in code. Use environment variables for future secrets.

## 9. Future connectors

Design an adapter boundary for:

- Aconex
- Egnyte
- Microsoft Graph / OneDrive / SharePoint

A connector should return normalized project records and source references without coupling the rest of the application to the source system.

## 10. Future persistence

When a real backend is introduced, the current cost-constrained preference is:

- PostgreSQL / Supabase for structured data and pgvector where suitable
- Cloudflare R2 for object storage where the application needs its own copy
- avoid duplicating source documents unnecessarily

These are later implementation choices, not dependencies of the local prototype.

## 11. Quality requirements

- TypeScript strictness
- readable components
- modular data-access layer
- no hard-coded secrets
- basic tests for response logic
- graceful handling of unknown/ambiguous questions
- responsive UI
- clear source/evidence presentation

## 12. Definition of done

The application opens locally, allows a user to ask the demonstration questions, returns the intended synthetic results, shows evidence/relationships, and demonstrates clarification and uncertainty behavior.
