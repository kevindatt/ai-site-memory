# AI Site Memory
## Product Discovery Document (PDD)

**Status:** Approved  
**Working product:** AI Site Memory  
**Initial experience:** Ask the Project  
**Category:** AI-powered Construction Project Information & Status Assistant

---

## 1. Executive Summary

AI Site Memory is an AI-powered project information and status assistant for construction projects. It is designed to reduce the repetitive information and status questions that consume the time of QA/QC, Document Control and other project staff by allowing authorized personnel to ask the project directly for information.

The long-term product is intended to create a living, queryable project memory that can understand project information, relationships, history and eventually monitored conditions and approved actions.

---

## 2. Problem Definition

Construction projects contain vast amounts of information: material submittals, WIRs, MIRs, RFIs, correspondence letters, subcontractor documents, procurement emails and trackers, drawings, specifications and many other project records. Numerous revisions are continuously made to different documents and submissions.

This information is distributed across Aconex, Excel registers, and PDF documents/drawings stored in an Egnyte environment. The volume of information, fragmented storage, frequent revisions and continuous project activity create a major challenge for information consumers to stay updated with the latest and most relevant project information.

Project personnel frequently depend on knowledgeable staff to locate, interpret and communicate information that already exists in project systems.

### Core problem statement

> Construction project information is distributed across Aconex, Excel registers and project files stored in Egnyte. Project personnel frequently need information that already exists within these systems but must rely on QA/QC, Document Control and other knowledgeable staff to locate, interpret and communicate it. This creates repetitive interruptions, delays access to information and concentrates project knowledge within individuals.

### Core opportunity

> Create a conversational interface to the project so authorized users can obtain reliable project information directly without needing to know where the information resides.

---

## 3. Target Users

### Information Providers

- QA/QC
- Document Control
- Project Engineers
- Project Management

### Information Consumers

- QA/QC
- Project Management
- Planning Team
- Procurement Team
- Commercial Team

### Administrators

- Project Administrators
- System Administrators

Future groups may include Design, MEP, HSE, site supervision, subcontractors, consultants and client representatives, subject to authorization and validation.

---

## 4. Jobs-to-be-Done

When I need to know what is happening with a project submission, I want to ask the project directly and receive a reliable, evidence-backed answer so that I do not need to contact another person or search multiple systems.

When I need to understand the history of a record, I want the system to connect related submissions, revisions, comments and status changes so that I can understand what happened without manually reconstructing the sequence.

When I ask a question, I want the system to tell me when it cannot verify the answer so that I do not act on an unsupported assumption.

When a question lacks enough context, I want the system to ask for clarification rather than guessing.

---

## 5. Current Workarounds

Current information access commonly relies on searching project systems and registers manually, asking QA/QC or Document Control personnel, checking emails/correspondence, reviewing spreadsheets, opening multiple document revisions and reconstructing history from separate records.

These practices can work but create repeated human interruptions and dependence on individuals who know where to find the information.

---

## 6. Product Opportunity

AI Site Memory should function as an intelligent conversational interface to project information.

The user should not need to know whether the answer exists in Aconex, an Excel register, Egnyte or a particular PDF. The system should locate and synthesize the relevant evidence.

> **We are not building a better search box. We are building a conversational interface to the project.**

---

## 7. Product Vision

> Make every construction project queryable, understandable, monitorable and eventually capable of taking controlled, approved actions.

Product evolution:

**Memory → Understand → Answer → Monitor → Predict → Act**

---

## 8. Core Product Hypothesis

> If authorized construction personnel can obtain reliable, evidence-backed project status and information through natural-language questions, a significant proportion of routine information requests currently directed to QA/QC, Document Control and other project staff can be handled without human intervention, reducing interruptions and improving access to project knowledge.

---

## 9. Product Principles

1. **Project-first:** Users interact with a project context rather than a generic chatbot.
2. **Source-backed:** Important factual answers should point to underlying project evidence.
3. **Human accountability:** AI assists; it does not silently make official project decisions.
4. **Explicit uncertainty:** Unknown or unsupported information must be presented as such.
5. **Persistent context:** Project entities and relationships should remain understandable across questions.
6. **Source-agnostic architecture:** The intelligence layer should not depend on one source system.
7. **Secure access:** Users should only retrieve information they are authorized to access.

---

## 10. Phase-1 Product Concept

### AI Site Memory — Ask the Project

An authorized construction user asks a natural-language question and receives a concise answer containing relevant project status, relationships, history and evidence.

Example:

> “What is the status of WIR-1842?”

Expected answer elements may include current status, submission date, current holder, review information, related records and source references.

---

## 11. Core Use Cases

- Status lookup
- Document/submission ownership
- Latest approved revision
- Overdue records
- Related WIR/MIR/NCR/RFI/submittal/drawing discovery
- Historical reconstruction
- Project-level status summaries
- Cross-record reasoning
- Documented delay explanation
- Missing/unsupported information handling
- Ambiguous or insufficient-context questions

---

## 12. Example User Questions

- What is the status of WIR-1842?
- Who is holding MIR-302?
- Which NCRs affect Villa 43 ceiling works?
- What is the latest approved drawing related to this submission?
- What happened after WIR-1842 was rejected?
- Which WIRs are overdue?
- Why is this submission still pending?
- Is the MIR for timber in the Cafe raised?
- Is the MIR for veneer for Townhouse raised?
- Is the color of this wall blue or is there a change?

The system should clarify ambiguous questions instead of guessing.

---

## 13. Differentiation

The initial differentiation is **status-first construction intelligence** rather than generic document Q&A.

Generic search asks:

> “What does this document say?”

AI Site Memory aims to answer:

> **“What is happening, what is related, what changed, and what evidence supports that?”**

Longer-term differentiation may come from project-specific relationships, history, workflow understanding and accumulated project context.

---

## 14. Source Connectivity & Knowledge Synchronization

The initial source landscape is:

- Oracle Aconex
- Excel registers
- PDF documents and drawings stored in Egnyte

The product should use connectors/import processes to bring permitted information into a controlled project knowledge layer.

Target pattern:

**Source → Connector/Import → Extraction → Normalization → Project Knowledge → Retrieval/Relationships → AI Response**

The user should not need to know the underlying data location.

The product must be capable of operating initially with controlled/synthetic data and later with authorized enterprise sources without redesigning the intelligence layer.

---

## 15. Validation Plan

### User discovery

Interview representative Information Providers and Information Consumers.

### Question-frequency study

Capture routine information requests over a defined period:

- who asked;
- what they asked;
- time required to answer;
- source systems/files checked;
- whether the answer required interpretation or historical reconstruction.

### Prototype validation

Test representative questions against controlled ground-truth data.

### Pilot validation

Measure whether routine information/status enquiries requiring human intervention decline and whether users trust and use the system.

---

## 16. Success Metrics

Primary product hypothesis:

> Reduce routine information/status enquiries requiring human intervention by at least 50% in a controlled pilot.

Supporting measures:

- answer accuracy;
- source traceability;
- hallucination/error rate;
- response time;
- user satisfaction;
- trust/usefulness;
- percentage of defined question types handled without human intervention.

These are validation targets, not guaranteed outcomes.

---

## 17. Scope and Non-Goals

Initial scope focuses on information retrieval, project relationships, status understanding, evidence and conversational interaction.

The early product does not assume autonomous approvals, official record modification, predictive project management, advanced BIM/model reasoning or automatic project actions.

---

## 18. Product Evolution

### Phase 1 — Ask

Answer construction project questions.

### Phase 2 — Understand

Deeper relationships, history, timelines and change tracking.

### Phase 3 — Intelligence

Bottleneck, anomaly and recurring-issue intelligence.

### Phase 4 — Monitor

Proactive alerts, overdue monitoring and exception detection.

### Phase 5 — Act

Controlled, approved workflow actions with auditability.

---

## 19. Key Risks

- inaccurate AI answers;
- incomplete source data;
- conflicting revisions/statuses;
- unauthorized data exposure;
- unreliable entity/relationship matching;
- user distrust;
- enterprise integration complexity;
- over-expanding scope before the core problem is validated.

---

## 20. Architectural Thesis

The LLM is not the project's source of truth.

Project records and source documents remain authoritative. The AI layer should interpret and explain retrieved information, identify relationships, answer questions and acknowledge uncertainty.

The architecture should separate:

**data ingestion → project knowledge → retrieval → reasoning → user experience**

so future source connectors can be added independently.

---

## 21. Commercial Thesis

AI Site Memory is intended to become a commercial B2B SaaS product.

The principal value proposition is reduction of repetitive project-information retrieval and status enquiries, improved access to project knowledge and, later, proactive project intelligence.

Potential commercial models include:

- per active project subscription;
- company/portfolio subscription;
- per-user licensing;
- hybrid subscription;
- subscription plus implementation/integration fees;
- enterprise annual license;
- carefully controlled usage-based AI components.

The initial pricing hypothesis is **per active project subscription**, with pricing validated through customer discovery and pilots.

---

## 22. Product Thesis

> Construction teams should not need to remember which system, register, document or person contains an answer. They should be able to ask the project, receive an evidence-backed answer, and understand what is known, what is related and what remains unknown.
