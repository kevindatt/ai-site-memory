import type { JSX } from "react";
import { DEMO_PROJECT } from "./data/project";

/**
 * Phase-0 scaffold shell only.
 * Full Ask-the-Project UI (question input, answers, evidence) lands in Phase 1.
 * This shell proves: local boot, project context, modular lib boundaries.
 */
export default function App(): JSX.Element {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">
          ASM
        </div>
        <div>
          <h1>AI Site Memory — Ask the Project</h1>
          <p className="subtitle">
            Construction project information &amp; status assistant · Phase-0 scaffold
          </p>
        </div>
      </header>

      <main className="app-main">
        <section className="card" aria-label="Project context">
          <h2>Project context</h2>
          <p>
            <strong>{DEMO_PROJECT.name}</strong> ({DEMO_PROJECT.id})
          </p>
          <p className="muted">
            Synthetic demo data only. Source: <code>data/test-project/registers/*.csv</code>
          </p>
        </section>

        <section className="card" aria-label="Scaffold status">
          <h2>Scaffold status</h2>
          <ul>
            <li>Local React + Vite + TypeScript strict shell: OK</li>
            <li>
              Modular boundaries: <code>src/lib/access → retrieval → relationships → respond</code>
            </li>
            <li>Full question answering arrives in Phase 1 / Phase 2.</li>
          </ul>
          <p className="disclaimer">
            AI-generated answers can contain mistakes. Always verify important decisions against
            authoritative project records.
          </p>
        </section>
      </main>
    </div>
  );
}
