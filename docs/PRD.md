# AI Site Memory
## Product Requirements Document (PRD)

**Version:** 0.5  
**Status:** Draft for review  
**Working product:** AI Site Memory  
**Phase-1 experience:** Ask the Project  
**Product category:** AI-powered Construction Project Information & Status Assistant

---

## 0. Relationship to the PDD

The PDD for AI Site Memory has been approved and is the product-discovery baseline for this PRD.

The PDD defines the problem, target users, product thesis, product opportunity and strategic direction. This PRD translates that foundation into product requirements, functional behavior, data requirements, implementation phases, acceptance criteria, technical boundaries and commercial hypotheses.

---

# 1. Product Vision

AI Site Memory provides an intelligent conversational interface to construction project information.

Authorized project personnel can ask natural-language questions about project records and receive concise, reliable, evidence-backed answers without manually searching multiple systems or repeatedly interrupting Information Providers and other knowledgeable project staff.

### Phase-1 promise

> **Ask the project instead of asking the person who knows the project.**

### Long-term vision

> Make every construction project queryable, understandable, monitorable and eventually capable of taking controlled, approved actions.

Product evolution:

**Memory → Understand → Answer → Monitor → Predict → Act**

---

# 2. Core Problem

Construction projects contain vast amounts of information: material submittals, WIRs, MIRs, RFIs, correspondence letters, subcontractor documents, procurement emails and trackers, drawings, specifications and many other project records. At the same time, numerous revisions are continuously being made to different documents and submissions.

This information is distributed across Aconex, Excel registers, and PDF documents/drawings stored in an Egnyte environment. The combination of large information volume, fragmented storage, frequent revisions and ongoing project activity creates a major challenge for information consumers to stay updated with the latest and most relevant project information.

Project personnel frequently need information that already exists within these sources but must rely on Information Providers and other knowledgeable staff to locate, interpret and communicate it.

This creates:

**Vast information volume + fragmented information + continuous revisions + dependence on human knowledge + repeated information requests = unnecessary time loss and information bottlenecks.**

AI Site Memory is therefore not primarily a document-search product. It is a conversational project information and status layer.

---

# 3. Product Hypothesis

> If authorized construction personnel can obtain reliable, evidence-backed project status and information through natural-language questions, a significant proportion of routine information requests currently directed to Information Providers and other project staff can be handled without human intervention, reducing interruptions and improving access to project knowledge.

---

# 4. User Types

## 4.1 Information Providers

Users who create, maintain, review or control project information:

- QA/QC
- Document Control
- Project Engineers
- Project Management

## 4.2 Information Consumers

Users who frequently require project information:

- QA/QC
- Project Management
- Planning Team
- Procurement Team
- Commercial Team

The same person or department may act as both an Information Provider and an Information Consumer.

## 4.3 Administrators

Users responsible for managing the application, projects, access, data sources and system configuration.

Administrators may include:

- Project Administrators
- System Administrators

Future user groups can be added subject to project permissions and validation.

---

# 5. Jobs-to-be-Done

### JTBD-01
When I need to know what is happening with a project submission, I want to ask the project directly and receive a reliable, evidence-backed answer so that I do not need to contact another person or search multiple systems.

### JTBD-02
When I need to understand the history of a record, I want the system to connect related submissions, revisions, comments and status changes so that I can understand what happened without manually reconstructing the sequence.

### JTBD-03
When I ask a question, I want the system to tell me when it cannot verify the answer so that I do not act on an unsupported assumption.

### JTBD-04
When my question is ambiguous or lacks sufficient project context, I want the system to ask a useful clarifying question rather than guessing which record, location, material or activity I mean.

---

# 6. Phase-1 Product Definition

Phase 1 is a secure web-based product experience where an authorized user can:

1. Select a project.
2. Ask a natural-language question.
3. Have the system identify relevant entities, records and documents.
4. Retrieve information from the available project knowledge base.
5. Understand relationships between records.
6. Determine the latest known status where supported by evidence.
7. Generate a concise answer.
8. Show the evidence supporting the answer.
9. Clearly distinguish confirmed facts, inference and unknown information.
10. Ask for clarification when the available context is insufficient.
11. Explicitly acknowledge that the AI can make mistakes and that important project decisions should be verified against authoritative project records.

Phase 1 is intentionally narrow. It proves the **Ask the Project** concept before enterprise integrations and autonomous actions are introduced.

---

# 7. Prototype User Experience

The initial product experience will center on the **Ask the Project** workflow.

### Primary screen elements

- AI Site Memory product header
- project selector or selected project context
- natural-language question input
- Ask/submit action
- suggested example questions
- conversational response area
- status summary
- related records
- source/evidence section
- explicit verification/uncertainty indication

### Primary demonstration question

> **What is the status of WIR-1842?**

The product should display a realistic evidence-backed answer including status, relevant dates, current holder/responsible party where available, related records and sources.

### Additional demonstration questions

- Who is holding MIR-302?
- Which NCRs affect Villa 43 ceiling works?
- What is the latest approved drawing related to this submission?
- What happened after WIR-1842 was rejected?
- Which WIRs are overdue?
- Why is this submission still pending?

---

# 8. Core Functional Requirements

## FR-01 Project Selection

The user can select the active project context.

## FR-02 Natural-Language Question Input

The user can ask questions using ordinary construction language without needing to know the source system, record number or storage location.

## FR-03 Entity Resolution

The system can identify likely project entities such as WIR, MIR, NCR, RFI, Submittal, Drawing, Document, Location, Level and Activity.

## FR-04 Structured Retrieval

The system can retrieve structured project records and metadata.

## FR-05 Document Retrieval

The system can retrieve relevant text/content from ingested PDF documents and drawings where extractable.

## FR-06 Semantic Search

The system can retrieve conceptually relevant records even when the user's wording does not exactly match the stored wording.

## FR-07 Relationship Resolution

The system can identify explicit or evidence-supported relationships among records.

## FR-08 Status Determination

The system can identify the latest applicable known status from available project data.

## FR-09 Historical Reconstruction

The system can reconstruct relevant record history from dated events/statuses.

## FR-10 Evidence Display

Factual answers provide supporting sources.

## FR-11 Uncertainty Handling

The system explicitly states when information is unknown, unavailable or only inferred.

## FR-12 No Fabrication

The system must not invent statuses, dates, responsible parties, revisions, comments or reasons.

## FR-13 Search Result Traceability

Each retrieved result should retain a source identifier that can be shown to the user or logged for evaluation.

## FR-14 Clarification Handling

When the user question lacks enough context to identify the correct record or scenario, the system should ask one or more targeted clarification questions before attempting a factual answer.

---

# 9. Phase-1 Use Cases

### UC-01 Status

> What is the status of WIR-1842?

### UC-02 Ownership

> Who is currently holding MIR-302?

### UC-03 Latest Revision

> What is the latest approved drawing for this detail?

### UC-04 Overdue Records

> Show all overdue WIRs.

### UC-05 Relationships

> Which NCR is related to WIR-1842?

### UC-06 History

> What happened after WIR-1842 was rejected?

### UC-07 Project-Level Summary

> How many NCRs are currently open?

### UC-08 Cross-Record Reasoning

> Which open NCRs affect Villa 43 ceiling works?

### UC-09 Missing Reason

> Why is this submission still pending?

### UC-10 Unsupported Information

> What did the consultant verbally tell the supervisor yesterday?

Expected behavior: state that this cannot be verified if it is absent from the available project data.

### UC-11 Lack of Context / Ambiguous Question

Examples:

> Is the MIR for timber in the Cafe raised?

or

> Is the MIR for veneer for Townhouse raised?

Expected behavior: the system should recognize that the available wording may not uniquely identify the intended MIR and should ask a targeted clarification such as the relevant project, townhouse/cafe location, document number, material reference or other distinguishing context before giving a definitive answer.

Additional ambiguity example:

> Is the color of this wall blue or is there a change?

Expected behavior: the system should determine whether sufficient project context, image information, drawing information or prior revision information exists. Where context is insufficient, it should ask the user to clarify the wall/location/drawing or provide the relevant image rather than guessing.

---

# 10. Data Sources

## 10.1 Initial prototype data

The initial product environment uses synthetic/local data only.

Expected files:

- WIR register
- MIR register
- NCR register
- RFI register
- Submittal register
- Drawing register
- representative PDF records
- representative PDF drawings

## 10.2 Target enterprise sources

### Oracle Aconex

Future authorized API connector for records, documents, workflows, status, users/organizations, dates, comments and related items as permitted.

### Excel registers

Initial ingestion through local/file upload. Future live synchronization may use Microsoft Graph when the workbook is hosted in OneDrive/SharePoint and organizational permissions allow it.

### Egnyte

Future authorized API connector for project file metadata and content retrieval.

## 10.3 Source-agnostic architecture requirement

The application intelligence layer must not depend directly on one source system.

Target model:

**Connector/Import → Extraction → Normalization → Project Knowledge → Retrieval/Relationships → AI Response**

This allows the same core product to work with synthetic data initially and authorized enterprise systems later.

---

# 11. Data Ingestion Requirements

## IR-01 Supported prototype formats

- CSV
- XLSX
- PDF

## IR-02 Extraction

Extract text and relevant metadata from supported documents.

## IR-03 Classification

Classify incoming content by likely record/document type.

## IR-04 Entity extraction

Identify identifiers, titles, revisions, dates, statuses, people/organizations, locations and other relevant fields.

## IR-05 Relationship extraction

Identify relationships using explicit identifiers, metadata and controlled inference.

## IR-06 Indexing

Store data in forms suitable for exact, structured and semantic retrieval.

## IR-07 Re-ingestion

The system should support re-running ingestion after source files change.

## IR-08 Ingestion diagnostics

Record failed files, parsing errors and ingestion status for debugging.

---

# 12. Project Knowledge Model

The system should represent the project as related entities, not as an undifferentiated document collection.

### Primary entities

- Project
- WIR
- MIR
- NCR
- RFI
- Submittal
- Drawing
- Document
- Workflow
- User/Organization
- Location
- Activity
- Event/Status Change

### Example relationship

Project → Villa 43 → Level 1 → Ceiling Works → WIR-1842 → NCR-031 → AR-043 Rev C

The exact database/graph implementation is a Technical Design decision.

---

# 13. Answer Design

A factual answer should use a consistent structure.

### Example

**WIR-1842 — Pending Consultant Review**

Submitted: 18 Sep 2026  
Current holder: Consultant QA  
Review started: 19 Sep 2026  
Due date: 21 Sep 2026

**Related records**  
NCR-031 · AR-043 Rev C

**Evidence**  
WIR-1842 · Workflow Record · NCR-031 · AR-043 Rev C

### Answer principles

- concise first;
- details available below the summary;
- source-backed;
- no unsupported claims;
- construction terminology understood in context;
- clear distinction between fact, inference and unknown;
- clear acknowledgement that AI-generated answers can contain mistakes and should be verified where the decision is important.

---

# 14. Source Precedence and Status Rules

When multiple records exist, the system must determine the latest applicable state using defined rules based on:

1. source-system metadata;
2. record/document date and time;
3. workflow state;
4. revision/version;
5. approval/status information.

The Technical Design must define explicit precedence rules.

The product must not assume that the newest uploaded file is automatically the latest approved document.

---

# 15. AI Requirements

The AI layer must:

- understand common construction terminology;
- identify entities and references from user language;
- reason over related records;
- synthesize retrieved evidence;
- ask for clarification when context is insufficient;
- state uncertainty;
- avoid hallucination;
- provide provenance;
- never silently use data outside the user's authorization scope.

### Critical principles

> **The LLM is not the source of truth. Project records and source documents are the source of truth.**

> **The AI can make mistakes. It must not present an unsupported answer as authoritative and should direct users to verify important information against source records.**

---

# 16. Permission and Security Requirements

## Security principles

- project access must be authorization-aware;
- retrieval must respect user/project permissions before data is passed to the AI model;
- secrets must never be hard-coded;
- secrets must use environment variables or secret management;
- public repositories must contain only safe synthetic data and source code;
- real project records must not be committed to a public repository.

### Initial implementation

A full enterprise identity provider is not required for the first local implementation. The architecture must still isolate project/user authorization as a future production concern.

---

# 17. Public Repository Data Policy

The public repository may contain:

- source code;
- documentation;
- synthetic/test project data;
- non-sensitive configuration examples;
- test cases.

It must never contain:

- real company project data;
- real Aconex credentials;
- Egnyte credentials;
- Microsoft credentials;
- access tokens;
- passwords;
- confidential drawings;
- client information;
- real project correspondence.

---

# 18. Technical Stack — Initial Implementation

The product should use a **cost-efficient, provider-agnostic architecture**. Initial implementation choices should minimize recurring cost without creating avoidable technical debt.

### Application framework

**Next.js + TypeScript** for the web application.

### Hosting

Recommended hosted architecture:

- **Cloudflare Pages** for the web application/static assets.
- **Cloudflare Workers** for lightweight API/server functions.

Cloudflare currently provides a Free Workers plan with 100,000 requests per day, and static Pages asset requests are free. citeturn552944search0turn552944search8

### Database

Recommended initial production-oriented database: **Supabase Free / PostgreSQL**.

The current Free plan includes 500 MB database size, 1 GB file storage, 5 GB egress and 500,000 Edge Function invocations. citeturn552944search1

Use PostgreSQL full-text capabilities and **pgvector** before introducing a separate paid vector database.

A local database or file-based data can still be used for the first development prototype where it simplifies development.

### File/object storage

Recommended file-storage platform: **Cloudflare R2**.

R2 Standard currently includes 10 GB-month of storage, 1 million Class A requests, 10 million Class B requests and free Internet egress each month. Storage beyond the included tier is currently $0.015/GB-month. citeturn471706search0

The application should avoid unnecessary duplication of source files. Where permitted, original project files should remain in Aconex, Egnyte or OneDrive/SharePoint. AI Site Memory should store references and extracted/indexed information and only cache originals when there is a clear product or operational need.

### AI provider

AI inference must use a **provider abstraction**. Application code must not depend directly on one model vendor.

For synthetic-data development and low-cost experimentation, the recommended cloud model is a current **Flash-Lite class model**. Google currently lists Gemini 3.1 Flash-Lite with a free tier and paid pricing of $0.25 per million input tokens and $1.50 per million output tokens. citeturn575111search0

The application should use efficient retrieval so that the model receives only the relevant project evidence rather than entire documents.

For confidential enterprise data, the production provider must satisfy the customer's data-use and security requirements. A local/self-hosted option such as **Ollama** can be used where appropriate to avoid API charges and keep data on controlled infrastructure. OpenCode supports local model runtimes including Ollama. citeturn857998search1turn857998search2

The Gemini Developer API free tier should be treated as a **synthetic/test-data option** because its pricing page states that content submitted on the free tier may be used to improve products. The paid tier states that customer content is not used for product improvement. citeturn575111search0

### Embeddings / semantic retrieval

Use an open/local embedding model where practical. Store vectors in PostgreSQL/pgvector initially. Avoid a separate hosted vector database unless scale or performance demonstrates a clear need.

### Document processing

Use local/open-source PDF, spreadsheet and OCR processing wherever technically adequate. Avoid per-document or per-page SaaS processing costs during early development.

### Accounts

The first local prototype can use a demo/local user context. Production authentication should be introduced before handling real company data.

### Payments

Payment processing must be isolated behind a payment-provider interface.

- Paystack remains the primary adapter for the requested **ND-first** commercial approach.
- Because Paystack's live merchant services are currently limited to businesses registered in supported countries and do not include the UAE, a UAE merchant must use a supported fallback provider for live payments. citeturn332639search3turn332639search4
- **Stripe UAE** is the current recommended low-fixed-cost fallback: no setup or monthly fee under standard pricing, with 2.9% + AED 1.00 per successful domestic-card transaction and additional charges for international cards/currency conversion. citeturn218445search1

Development and test environments must use payment-provider test/sandbox mode rather than live transactions.

---

# 19. Product Design Requirements

The design should communicate that this is a **construction project intelligence tool**, not a generic chatbot.

### Design direction

- professional enterprise interface;
- construction/project visual language;
- high information clarity;
- restrained use of color;
- status indicators;
- source/evidence visibility;
- strong hierarchy;
- usable on a desktop browser;
- minimal unnecessary decoration.

### Core UX principle

> The user should feel that they are **asking the project**, not asking a generic AI assistant.

The UI/UX will be refined iteratively as the product is developed and tested.

---

# 20. Product Development Change Log

Material design and implementation steering decisions should be recorded here so that the development history remains understandable.

### Initial steering direction

Build the first product experience around the **Ask the Project** workflow using realistic synthetic construction data rather than building a generic-purpose chatbot.

### Steering change 01

**Instruction to development agent:** Replace generic chatbot framing with a construction-project information/status interface.

**Reason:** The product must immediately communicate its construction-specific purpose.

### Steering change 02

**Instruction to development agent:** Add evidence/source presentation to factual answers.

**Reason:** Trust and traceability are core product principles.

### Steering change 03

**Instruction to development agent:** Display status, dates, current holder/responsible party and related records for relevant status questions.

**Reason:** The primary problem is repetitive project-status requests.

### Steering change 04

**Instruction to development agent:** Use synthetic construction data only in the public repository.

**Reason:** The repository must remain safe for public access.

### Steering change 05 — Prototype framework decision (2026-09-27)

**Original choice/proposal:** React + Vite + TypeScript strict + plain CSS (per `docs/TECHNICAL_BUILD_SPEC.md` §3) versus Next.js (per PRD §18 recommendation for the hosted product).

**Final decision:** Use React + Vite + TypeScript strict + plain CSS for the prototype. Do not switch to Next.js for this prototype.

**Reason:** The first working product is a local single-page construction project information prototype. React + Vite provides the simplest and most maintainable implementation for the current scope, minimizes dependencies, requires no server or cloud infrastructure, and keeps the prototype cost at zero.

**Scope note:** This applies to the prototype only and does not prevent a future production framework change. The architecture must remain modular so that a future backend or production framework can be introduced without redesigning the core retrieval/relationship logic.

### Steering change 06 — design.html visual refinement: Ask button prominence + status indicator hierarchy

**Initial design state:** The `design.html` preview used a flat amber `Ask` button (same weight as surrounding elements) and a small pending-status badge (`.85rem`, 1px pale border, `#92400e` on `#fef3c7`).

**Exact refinement requested:** Make the primary `Ask` button more visually prominent and improve the contrast/visual hierarchy of the project status indicator, without redesigning the page or adding functionality.

**Reason:** The `Ask` action must read instantly as the primary user action, and the project status state must be recognizable at a glance in the answer card.

**What was changed in design.html (CSS only, same palette/typography/layout):** the `Ask` button now uses an amber gradient, uppercase + wider tracking, larger padding, a darker bottom edge, drop shadow, and visible hover/focus/active states; the status badge is larger (`1rem`), uses a 2px `#d97706` border, darker `#78350e` text for stronger contrast, and a status-dot marker via `::before`.

### Steering change 07 — Aconex-inspired enterprise theme for design.html

**Review of the initial design:** The reviewer found the warm sand/amber `design.html` preview too informal — it read closer to a generic AI chatbot than to professional enterprise construction software.

**Request:** Move the visual theme toward an Aconex-inspired enterprise construction-software aesthetic, using Aconex only as visual inspiration (color direction, professional feel, restraint, project-management character) without cloning its interface.

**Reason:** The preview must feel like a credible enterprise construction platform so it can later guide the real application styling.

**What was changed in design.html (styling/tokens only; concept, hierarchy, content and disclaimer preserved):** deep-navy header (`#102a43`) with a restrained gold rule (`#b98a2f`) and white product mark; enterprise-blue primary accent (`#0b5fa5`/`#084a82`) applied to the `Ask` button, question rail, links of emphasis and related-record pills; cool register-gray page ground (`#e9edf1`) with steel-gray text; sharper `6px` enterprise corner radius; caution/verified semantics kept but retuned (gold-bordered pending badge, `#d9b45c`-bordered disclaimer); theme-token swatch section updated to the new palette. Still fully self-contained with no external dependencies or assets.

Additional material development steering decisions should be added chronologically below this section.

---

# 21. Product Roadmap

## Phase 0 — Discovery

Status: **Complete**

Deliverables:

- approved PDD;
- problem hypothesis;
- target users;
- product thesis;
- validation approach.

## Phase 1 — Ask the Project

Scope:

- conversational project interface;
- project context;
- synthetic/controlled project data;
- status and relationship questions;
- evidence-backed answers;
- uncertainty and clarification handling.

## Phase 2 — Functional Local MVP

Scope:

- real ingestion pipeline;
- CSV/XLSX/PDF processing;
- normalized project data model;
- retrieval engine;
- relationship engine;
- evaluation harness;
- broader question set.

## Phase 3 — Enterprise Data Connectivity

- authorized Aconex connector;
- Egnyte connector;
- Microsoft Graph/OneDrive connector;
- synchronization;
- permission mapping.

## Phase 4 — Project Intelligence

- timelines;
- change history;
- anomaly identification;
- recurring issue detection;
- bottleneck intelligence.

## Phase 5 — Monitoring

- proactive alerts;
- overdue monitoring;
- exception detection;
- scheduled summaries.

## Phase 6 — Controlled Action

- prepare actions;
- request approvals;
- execute approved actions through integrations;
- audit trail.

No autonomous official project action is included before the product's requirements and security model explicitly authorize it.

---

# 22. Success Metrics

## Product hypothesis metrics

### Primary

Target hypothesis: reduce routine information/status enquiries requiring human intervention by **at least 50%** in a controlled pilot.

### Secondary

- at least 80% of defined Phase-1 question types answered without human intervention;
- at least 95% factual accuracy on a validated evaluation set;
- factual answers provide evidence;
- low hallucination rate;
- acceptable response time;
- positive user usefulness/trust feedback.

These are experimental targets and must be validated rather than assumed.

---

# 23. Acceptance Criteria

### Product prototype acceptance

**AC-01** A local application page opens successfully in a browser.

**AC-02** A demo project is shown or selected.

**AC-03** A user can submit a natural-language project question.

**AC-04** The system returns a construction-specific answer from controlled test data.

**AC-05** A status question returns relevant status information.

**AC-06** A relationship question demonstrates linked records.

**AC-07** The answer displays evidence/source references.

**AC-08** The system communicates uncertainty where evidence is insufficient.

**AC-09** The system asks for clarification when the question lacks sufficient context.

**AC-10** The system does not fabricate project information.

**AC-11** The product communicates that AI-generated answers can contain mistakes and should be verified for important decisions.

### Functional MVP acceptance

The functional MVP must additionally satisfy the ingestion, retrieval, relationship, permission and evaluation requirements defined in this PRD.

---

# 24. Monetization Strategy

AI Site Memory is intended to be a commercial B2B SaaS product.

## Commercial positioning

Do not position the product primarily as:

> “AI chatbot for construction.”

Position it as:

> **An AI project information and status layer that reduces repetitive information retrieval and status enquiries across construction teams.**

## Monetization options

The following models should be considered during commercial validation.

### Option A — Per Active Project Subscription

Charge a monthly or annual subscription for each active construction project.

**Advantages:** aligns price with project-level value and encourages broad internal usage.

**Potential structure:**

- Pilot project plan
- Professional project plan
- Enterprise project plan

### Option B — Company / Portfolio Subscription

Charge a construction company based on the number of active projects or an agreed portfolio size.

**Advantages:** easier enterprise procurement and predictable annual revenue.

### Option C — Per User / Seat

Charge based on active users or user tiers.

**Advantages:** familiar SaaS model.

**Concern:** may discourage broad adoption when the product's value is created by serving everyone on the project.

### Option D — Hybrid Subscription

Combine a base project fee with a defined number of users, projects, or AI usage allowance.

**Advantages:** balances predictable revenue with usage growth.

### Option E — Project Subscription + Implementation Fee

Charge recurring SaaS fees plus a one-time onboarding/integration fee.

Potential implementation services:

- project onboarding;
- data mapping;
- connector setup;
- permissions configuration;
- project taxonomy configuration;
- training.

### Option F — Enterprise License

Annual enterprise contract covering multiple projects, security requirements, integrations, administration and support.

### Option G — Usage / AI Credit Component

A subscription could include a defined AI usage allowance with additional charges for unusually high consumption.

This should be considered only after customer behavior and AI operating cost are understood; it should not discourage normal question asking.

## Current commercial hypothesis

**Per active project subscription** is the preferred initial model because the principal value proposition is project-level: reducing repetitive information retrieval and status enquiries across the project team.

## Payment Architecture

The product must isolate payment-provider-specific implementation behind a **payment provider interface** so that the application is not tightly coupled to a single payment processor.

### Primary provider

**Paystack** will remain the primary payment-provider adapter in the product architecture, using the **ND-first** approach defined for the initial go-to-market context.

However, production payment availability must be **jurisdiction-aware**. As of September 2026, Paystack's live merchant services are available to businesses registered in Nigeria, Ghana, South Africa and Kenya, with private beta programs in Côte d'Ivoire and Egypt. A UAE-registered merchant must therefore not assume that Paystack can be activated for live payments. citeturn332639search3turn332639search4

For a UAE-registered merchant, the application should support a second payment-provider adapter. **Stripe UAE** is the current recommended fallback because its standard UAE pricing has no setup or monthly fee and charges 2.9% + AED 1.00 per successful domestic-card transaction, with additional charges for international cards and currency conversion. citeturn218445search1

The application must select the production provider according to the merchant entity, supported country, commercial requirements and compliance status, without changing the core billing-domain logic.

### Supported payment modes

The product should support: 

- **Full payment** for the selected subscription, onboarding or implementation fee.
- **Installment payment** where the applicable commercial plan allows staged payments.

Where recurring billing is used, the implementation should use Paystack's supported subscription/recurring-payment capabilities rather than implementing card charging logic directly.

### Webhooks

Payment state must be updated through **server-side webhook events** from the payment provider. The application must not rely solely on a browser redirect or client-side success message to mark an invoice or subscription as paid.

Webhook processing must be designed for: 

- signature/authenticity verification;
- idempotent event handling;
- duplicate-event protection;
- recording the provider event/reference;
- updating payment, invoice and subscription state;
- handling successful, failed, refunded and cancelled states where applicable.

Paystack documents webhook events for successful charges, invoices, subscriptions, refunds and other payment lifecycle events. citeturn149417search3turn149417search4

### Payment-domain principle

The application's billing records remain the application's source of truth for entitlement state, while the payment provider remains the external source for payment processing and transaction events. Reconciliation mechanisms must be supported in later production phases.

### Indicative pricing hypotheses

These are starting hypotheses for validation, not final prices:

- Pilot: approximately AED 1,000–2,500 per project/month
- Professional: approximately AED 3,000–7,500 per project/month
- Enterprise: custom pricing

## Additional revenue opportunities

- project onboarding fee;
- data mapping/configuration;
- enterprise connector implementation;
- premium monitoring/analytics;
- enterprise security/integration features;
- implementation/support services.

## Monetization principle

The product should encourage useful and frequent question answering rather than create friction through per-question pricing. Pricing should ultimately reflect measurable project value and operating cost.

## Long-term value progression

**Ask → Understand → Monitor → Act**

As capabilities increase, customer value and commercial tiers can expand accordingly.

---

# 25. Non-Goals for Phase 1

The following are not part of the initial Phase-1 product scope:

- live Aconex integration;
- live Egnyte integration;
- live OneDrive/SharePoint integration;
- Teams integration;
- WhatsApp integration;
- production authentication;
- production database;
- automated modification of project records;
- approvals;
- predictive analytics;
- autonomous actions;
- BIM/model reasoning;
- advanced drawing geometry analysis;
- full construction project-management functionality.

Any change to these boundaries requires an explicit PRD update.

---

# 26. Open Decisions for Technical Design

1. Production database technology.
2. Production vector/search technology.
3. Graph/relationship implementation.
4. Production AI model/provider.
5. Hosting platform.
6. Authentication/SSO.
7. Aconex connector architecture.
8. Egnyte connector architecture.
9. Microsoft Graph connector architecture.
10. OCR strategy for scanned PDFs.
11. Detailed source-precedence rules.
12. Detailed authorization mapping.
13. Data retention and deletion policy.
14. Production observability and audit design.
15. Final commercial packaging and pricing.

---

# 27. Immediate Product Development Roadmap

### Step 1 — Finalize PRD

Confirm the product requirements and boundaries in this document.

### Step 2 — Establish the project codebase

Create the application structure, documentation, environment configuration, test data and development instructions.

### Step 3 — Create the initial product experience

Implement the Ask the Project interface and representative construction-data interactions.

### Step 4 — Validate the core behavior

Run representative questions against controlled ground-truth data and refine the answer, evidence, clarification and uncertainty behavior.

### Step 5 — Implement the functional local MVP

Introduce structured ingestion, normalized data, retrieval and relationship handling.

### Step 6 — Prepare enterprise connectivity

Implement authorized connectors and synchronization for Aconex, Egnyte and Microsoft Graph/OneDrive as appropriate.

### Step 7 — Pilot and measure

Measure interruption reduction, answer accuracy, usability, trust and operational value.

### Step 8 — Expand intelligence

Add monitoring, proactive insights, alerts and eventually controlled actions.

---

# 28. Product Thesis

> Construction teams should not need to remember which system, register, document or person contains an answer. They should be able to ask the project, receive an evidence-backed answer, and understand what is known, what is related and what remains unknown.

---

# 29. Cost-Constrained Architecture

Cost is a product-level design constraint. AI Site Memory should remain **nil to negligible in fixed infrastructure cost during prototype and early validation**, while variable AI and payment costs remain proportional to actual usage/revenue.

## Recommended cost posture

| Component | Prototype / early validation recommendation | Current reference cost |
|---|---|---|
| GitHub | Public repository | $0 on GitHub Free |
| Web hosting | Cloudflare Pages | $0 within free limits |
| API/server functions | Cloudflare Workers | $0 within free limits |
| Database | Supabase Free | $0 within free limits |
| Project file storage | Cloudflare R2 | $0 for first 10 GB-month |
| Semantic search | PostgreSQL/pgvector + local embeddings | $0 additional service cost |
| PDF/Excel/OCR processing | Local/open-source | $0 API cost |
| AI inference | Free tier / low-cost Flash-Lite / local model | $0 initially; low usage-based cost later |
| Payment processing | Provider sandbox during development | $0 during testing |

The figures above are based on current vendor pricing and free-tier limits and can change. citeturn552944search2turn552944search0turn552944search1turn471706search0turn575111search0

## Storage strategy

File storage should be intentionally separated from structured project data.

For example, R2 currently provides 10 GB-month free. At the current $0.015/GB-month Standard rate, approximately 100 GB of total stored files would cost about **$1.35/month** after the included 10 GB, before request charges; approximately 1 TB would be about **$14.85/month** after the included 10 GB, before request charges. citeturn471706search0

Therefore, R2 is the preferred external object-storage option for the early product.

## AI cost strategy

The system must minimize AI cost by: 

1. resolving exact record identifiers before invoking the LLM where possible;
2. using structured database queries before semantic retrieval;
3. retrieving only the smallest relevant evidence set;
4. using a smaller Flash-Lite class model for routine questions;
5. escalating only difficult questions to a more capable model when justified;
6. optionally using local models where infrastructure permits;
7. logging token usage by project and request type.

As a reference, Gemini 3.1 Flash-Lite is currently priced at $0.25 per million input tokens and $1.50 per million output tokens on the paid Standard tier. citeturn575111search0

The actual cost per question must be benchmarked after the retrieval pipeline is implemented.

## Payment cost strategy

Payment processing is a variable cost associated with revenue generation, not a reason to maintain a permanent infrastructure fee.

Paystack test mode can be used without live transaction cost. For a UAE-registered merchant, Paystack is not currently a live-market option, so Stripe UAE is the preferred low-fixed-cost fallback. Stripe's current standard UAE pricing has no monthly/ setup fee; charges occur when a successful transaction is processed. citeturn218445search1turn332639search3

## Operating-cost targets

### Prototype

Target: **AED 0 incremental infrastructure cost** using local development, synthetic data, free service tiers and sandbox payment mode.

### Early validation

Target: **AED 0–100/month fixed infrastructure cost** until the product has meaningful paid usage, excluding optional custom-domain registration, payment transaction fees and any paid AI usage chosen for performance/privacy.

### Scaling

Infrastructure should only move to paid tiers when a specific requirement is demonstrated, such as larger data volume, always-on availability, backups, security controls, enterprise identity, higher AI volume or connector requirements.

## Cost protection

The system should provide configuration options for: 

- maximum AI requests per user/project/day;
- maximum document-ingestion volume per job;
- maximum AI token budget per request;
- usage logging;
- cost alerts/budget thresholds where supported by the provider.

This is intended to prevent unexpected cost escalation while the business model is being validated.

---

# 30. Version History

### Version 0.5

- Added cost-constrained architecture as a product-level requirement.
- Selected Cloudflare Pages/Workers, Supabase Free and Cloudflare R2 as the recommended low-cost hosted stack.
- Added AI cost controls, Flash-Lite model strategy and local-model option.
- Clarified that Paystack is not currently available for live UAE-registered merchants and added Stripe UAE as the recommended low-fixed-cost fallback.
- Added storage-cost guidance and early operating-cost targets.

### Version 0.4

- Added cost-constrained architecture and low-cost hosting/storage recommendations.
- Added jurisdiction-aware payment-provider selection while retaining Paystack as the primary adapter.
- Added Stripe UAE as the current fallback for UAE-registered merchants.
- Added explicit prototype and early-validation operating-cost targets.

### Version 0.3

- Expanded the core problem to reflect the volume and variety of construction information and frequent document revisions.
- Simplified user taxonomy into Information Providers, Information Consumers and Administrators.
- Added clarification handling for ambiguous project questions.
- Added lack-of-context use cases.
- Strengthened AI mistake/verification requirements.
- Removed temporary/non-product implementation context from the product requirements.
- Expanded monetization alternatives while retaining per-active-project subscription as the current hypothesis.
- Added source-agnostic architecture and enterprise connectivity roadmap requirements.
