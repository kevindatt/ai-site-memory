# First OpenCode Instruction

Read the approved `docs/PDD.md`, approved `docs/PRD.md`, `docs/TECHNICAL_BUILD_SPEC.md`, and root `AGENTS.md` before making changes.

Build only the Phase-1 local prototype described in the technical build specification.

Requirements:

1. Create a clean single-page web application for **AI Site Memory — Ask the Project**.
2. Use synthetic construction data only.
3. Implement project context, question input, suggested questions, answer display, related records, source evidence, and uncertainty/clarification states.
4. Support the ten demonstration questions defined in `docs/TECHNICAL_BUILD_SPEC.md`.
5. For ambiguous questions such as the veneer/Townhouse MIR or Timber/Cafe MIR, ask for the missing context instead of guessing.
6. Make the interface immediately recognizable as a construction project information/status assistant, not a generic chatbot.
7. Do not implement live Aconex, Egnyte, OneDrive, Teams, WhatsApp, production authentication, payments, or production database infrastructure.
8. Keep retrieval/data access modular so those integrations can be added later.
9. Before coding, briefly state the implementation approach and acceptance criteria you are targeting.
10. After implementation, run the relevant local checks/tests and report what passed and what remains.
11. When a product/design decision changes from the PRD, update the `Agent Steering & Design Change Log` in `docs/PRD.md` with the instruction/steering change and reason.

Do not add unnecessary frameworks or dependencies. Prefer the smallest maintainable implementation that demonstrates the product concept clearly.
