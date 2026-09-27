import { useState } from "react";
import type { FormEvent, JSX } from "react";
import "./App.css";
import { DEMO_PROJECT } from "./data/project";
import { PROJECT_ID, store } from "./data/registers";
import { checkAccess, getDemoUser } from "./lib/access";
import type { PendingTopic } from "./lib/respond";
import { answerQuestion, verificationBadge } from "./lib/respond";
import type { Answer } from "./lib/types";

/**
 * Ask the Project — working local prototype page.
 * Deterministic retrieval over synthetic registers; no LLM, no network.
 */

type ChatMessage =
  | { kind: "user"; text: string }
  | { kind: "note"; text: string }
  | { kind: "answer"; answer: Answer };

const SUGGESTED_QUESTIONS = [
  "What's the status of WIR-1842?",
  "Who is holding MIR-302?",
  "Which NCR is related to WIR-1842?",
  "What is the latest approved drawing for Villa 43 ceiling?",
  "Which WIRs are overdue?",
  "What happened after WIR-1842 was rejected?",
  "Is the MIR for veneer for Townhouse raised?",
  "What is the status of the MIR for Timber in Cafe?"
];

const GREETING =
  "You are asking the Qubators Demo Project. I answer only from the available project records, show my evidence, and say so when something cannot be verified. Try a suggested question below.";

function AnswerCard({
  answer,
  onRelatedClick
}: {
  answer: Answer;
  onRelatedClick: (id: string) => void;
}): JSX.Element {
  const badge = verificationBadge(answer.verification);
  return (
    <div className="answer-card">
      <div className="status-line">
        <span className="answer-title">{answer.title}</span>
        <span className={`badge badge-${badge.tone}`}>{badge.label}</span>
      </div>
      <p className="answer-summary">{answer.summary}</p>
      {answer.facts.length > 0 && (
        <dl className="facts">
          {answer.facts.map((item) => (
            <div className="fact-row" key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {answer.relatedIds.length > 0 && (
        <div className="rel-row" aria-label="Related records">
          {answer.relatedIds.map((id) => (
            <button key={id} type="button" className="rel-chip" onClick={() => onRelatedClick(id)}>
              {id}
            </button>
          ))}
        </div>
      )}
      {answer.evidence.length > 0 && (
        <div className="evidence" aria-label="Evidence and sources">
          <h3>Evidence / Sources</h3>
          <ul>
            {answer.evidence.map((source) => (
              <li key={source}>
                <code>{source}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {answer.followUp !== undefined && <p className="followup">{answer.followUp}</p>}
    </div>
  );
}

export default function App(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([{ kind: "note", text: GREETING }]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingTopic | null>(null);

  function send(raw: string): void {
    const text = raw.trim();
    if (text === "") return;
    const user = getDemoUser();
    if (!checkAccess(user, PROJECT_ID)) {
      setMessages((prev) => [
        ...prev,
        { kind: "user", text },
        {
          kind: "answer",
          answer: {
            title: "Access denied",
            summary: "The demo user is not authorized for this project.",
            facts: [],
            relatedIds: [],
            evidence: [],
            verification: "Cannot verify from available project records"
          }
        }
      ]);
      return;
    }
    const result = answerQuestion(text, store, pending);
    setPending(result.pending);
    setMessages((prev) => [...prev, { kind: "user", text }, { kind: "answer", answer: result.answer }]);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    send(input);
    setInput("");
  }

  function askRelated(id: string): void {
    send(`What is the status of ${id}?`);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="mark" aria-hidden="true">
          ASM
        </div>
        <div>
          <h1>AI Site Memory</h1>
          <p className="subtitle">
            Ask the Project — local working prototype · deterministic answers · synthetic data
          </p>
        </div>
      </header>

      <div className="context-bar">
        <span className="context-label">Project</span>
        <span className="project-pill">{DEMO_PROJECT.name}</span>
        <span className="project-id">{DEMO_PROJECT.id}</span>
        <span className="user-pill">Demo User · local prototype</span>
      </div>

      <main className="main">
        <section className="ask-panel" aria-label="Ask the project">
          <h2>Ask the Project</h2>
          <form className="ask-row" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a WIR, MIR, NCR, drawing, holder, overdue items…"
              aria-label="Project question"
            />
            <button className="btn-primary" type="submit">
              Ask
            </button>
          </form>
          <div className="chips" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button key={question} type="button" className="chip" onClick={() => send(question)}>
                {question}
              </button>
            ))}
          </div>
          <p className="engine-note">
            Local deterministic engine — no LLM, AI API, or external project system is used.
          </p>
        </section>

        <section className="thread" aria-label="Conversation" aria-live="polite">
          {messages.map((message, index) => {
            if (message.kind === "user") {
              return (
                <div key={index} className="user-msg">
                  {message.text}
                </div>
              );
            }
            if (message.kind === "note") {
              return (
                <div key={index} className="note-msg">
                  {message.text}
                </div>
              );
            }
            return <AnswerCard key={index} answer={message.answer} onRelatedClick={askRelated} />;
          })}
        </section>

        <section className="disclaimer" aria-label="Verification notice">
          AI can make mistakes. Verify important project decisions against the authoritative source
          records listed as evidence above.
        </section>
      </main>

      <footer className="footer">
        AI Site Memory · Ask the Project · synthetic demo content only — not connected to live
        project systems.
      </footer>
    </div>
  );
}
