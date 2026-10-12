import { useEffect, useMemo, useState } from "react";
import type { FormEvent, JSX } from "react";
import "./App.css";
import { checkFileSize, classifyFile, emptyScan } from "./connectors/localFiles";
import type { DirHandle } from "./connectors/directoryAccess";
import {
  hasDirectoryAccess,
  loadDirectory,
  pickDirectory,
  queryDirPermission,
  readDirectoryFiles,
  requestDirPermission,
  saveDirectory
} from "./connectors/directoryAccess";
import { LocalSourceConnector } from "./connectors/source";
import type { NormalizedSheet } from "./connectors/xlsx";
import { mergeSources, parseWorkbook } from "./connectors/xlsx";
import { runDiagnostics } from "./data/diagnostics";
import { DEMO_PROJECT } from "./data/project";
import { PROJECT_ID, ProjectStore, store, toReferenceRecords } from "./data/registers";
import { USERS, checkAccess, getDemoUser, getUser } from "./lib/access";
import type { ActionProposal } from "./lib/actions";
import { approveAction, executeAction, listActions, rejectAction } from "./lib/actions";
import type { AuditEntry } from "./lib/audit";
import { clearAudit, logAccess, readAudit } from "./lib/audit";
import { acknowledgeWatcher, evaluateWatchers } from "./lib/watchers";
import type { PendingTopic } from "./lib/respond";
import { answerQuestion, resolvePronouns, verificationBadge } from "./lib/respond";
import type { Answer } from "./lib/types";

/**
 * Ask the Project — working local prototype page.
 * Deterministic retrieval over local registers; no LLM, no network, no APIs.
 */

const SYNTHETIC_LABEL = "Synthetic data · data/test-project";

const localConnector = new LocalSourceConnector("local-files");

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
  "What is the status of the MIR for Timber in Cafe?",
  "How many NCRs are currently open?",
  "What needs attention?"
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
          {answer.facts.map((item, index) => (
            <div className="fact-row" key={`${item.label}-${index}`}>
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
  const [userId, setUserId] = useState(getDemoUser().userId);
  const user = getUser(userId) ?? getDemoUser();
  const [lastRecordId, setLastRecordId] = useState<string | null>(null);
  const [projectStore, setProjectStore] = useState<ProjectStore>(store);
  const [sourceLabel, setSourceLabel] = useState(SYNTHETIC_LABEL);
  const [sourceTime, setSourceTime] = useState<string | null>(null);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<{
    at: string;
    files: number;
    counts: string;
    sheets: string[];
    notes: string[];
    pdfs: number;
  } | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(() => readAudit());
  const [panelVersion, setPanelVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dirHandle, setDirHandle] = useState<DirHandle | null>(null);
  const [dirNeedsReconnect, setDirNeedsReconnect] = useState(false);
  const [askedQuestions, setAskedQuestions] = useState<string[]>([]);
  const watcherStates = useMemo(() => evaluateWatchers(projectStore), [projectStore, panelVersion]);
  const actionProposals = useMemo(() => listActions().slice().reverse(), [panelVersion]);

  function recordAudit(question: string, answer: Answer, allowed: boolean): void {
    logAccess({
      ts: new Date().toISOString(),
      userId: user.userId,
      question,
      verification: answer.verification,
      evidenceRefs: answer.evidence.length,
      allowed
    });
    setAuditEntries(readAudit());
  }

  function send(raw: string): void {
    const text = raw.trim();
    if (text === "") return;
    // Latest search stays on top; previous searches shift down.
    setAskedQuestions((prev) => [text, ...prev.filter((asked) => asked !== text)].slice(0, 12));
    if (!checkAccess(user, PROJECT_ID)) {
      const answer: Answer = {
        title: "Access denied",
        summary: "The demo user is not authorized for this project.",
        facts: [],
        relatedIds: [],
        evidence: [],
        verification: "Cannot verify from available project records"
      };
      recordAudit(text, answer, false);
      setMessages((prev) => [{ kind: "user", text }, { kind: "answer", answer }, ...prev]);
      setPanelVersion((version) => version + 1);
      return;
    }
    const resolved = resolvePronouns(text, lastRecordId);
    const result = answerQuestion(resolved, projectStore, pending, user, {
      lastRecordId: lastRecordId ?? undefined,
      isLocalData: sourceLabel !== SYNTHETIC_LABEL
    });
    setPending(result.pending);
    if (result.primaryId !== undefined) setLastRecordId(result.primaryId);
    recordAudit(text, result.answer, !result.answer.title.startsWith("Access denied"));
    setMessages((prev) => [{ kind: "user", text }, { kind: "answer", answer: result.answer }, ...prev]);
    setPanelVersion((version) => version + 1);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    send(input);
    setInput("");
  }

  function askRelated(id: string): void {
    send(`What is the status of ${id}?`);
  }

  /** Load user-picked local files (C1–C3 without enterprise APIs). */
  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (fileList === null || fileList.length === 0) return;
    await loadFiles(Array.from(fileList), "fresh");
  }

  /** Import picked files; refresh=true re-reads them and reports what changed. */
  async function loadFiles(files: File[], mode: "fresh" | "refresh", label?: string): Promise<void> {
    const oversized = files
      .map((file) => checkFileSize(file.name, file.size))
      .filter((message): message is string => message !== null);
    if (oversized.length > 0) {
      setMessages((prev) => [
        {
          kind: "note",
          text: `Import refused — oversized file(s): ${oversized.join(" ")} Kept the current data.`
        },
        ...prev
      ]);
      return;
    }
    setLoading(true);
    try {
      const scan = emptyScan(mode === "refresh" ? "refreshed files" : "picked files");
      // Same filename in different subfolders must not overwrite each other.
      const usedNames = new Set<string>();
      const uniqueName = (name: string): string => {
        if (!usedNames.has(name.toLowerCase())) {
          usedNames.add(name.toLowerCase());
          return name;
        }
        let counter = 2;
        const dot = name.lastIndexOf(".");
        const stem = dot >= 0 ? name.slice(0, dot) : name;
        const ext = dot >= 0 ? name.slice(dot) : "";
        let renamed = `${stem} ~${counter}${ext}`;
        while (usedNames.has(renamed.toLowerCase())) {
          counter += 1;
          renamed = `${stem} ~${counter}${ext}`;
        }
        usedNames.add(renamed.toLowerCase());
        return renamed;
      };
      const xlsxFiles: File[] = [];
      for (const file of files) {
        const kind = classifyFile(file.name);
        const name = uniqueName(file.name);
        if (kind === "csv") scan.csvFiles[name] = await file.text();
        else if (kind === "text") scan.textDocs[name] = await file.text();
        else if (kind === "pdf") scan.pdfFiles.push(name);
        else if (kind === "xlsx") {
          scan.xlsxFiles.push(name);
          xlsxFiles.push(file);
        } else scan.otherFiles.push(name);
      }
    // Clean + normalize workbook sheets (header variants, dates, empty rows).
    const sheets: NormalizedSheet[] = [];
    const sheetNotes: string[] = [];
    for (const file of xlsxFiles) {
      try {
        const parsed = parseWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
        sheets.push(...parsed.sheets);
        sheetNotes.push(...parsed.notes);
      } catch {
        sheetNotes.push(`${file.name}: could not be read as a workbook.`);
      }
    }
    const merged = mergeSources(scan, sheets);
    if (merged.bundle === null) {
      if (connectionId !== null) {
        localConnector.markStale(connectionId, "latest import failed validation");
        setConnectionStatus("stale — latest import failed");
      }
      setMessages((prev) => [
        {
          kind: "note",
          text: `Could not load local files [${files.map((file) => file.name).join(", ")}]: no register source found for ${merged.missing.join(", ")}. Needed: CSVs or workbook sheets matching wir, mir, ncr, rfi, drawing, submittal or mail. Kept the current data.${merged.notes.length > 0 ? ` Details: ${merged.notes.join(" ")}` : ""}`
        },
        ...prev
      ]);
      setLoading(false);
      return;
    }
    const before = mode === "refresh" ? countRows(projectStore) : null;
    const reference = toReferenceRecords(merged.tables);
    const fresh = new ProjectStore(merged.bundle, reference);
    const report = runDiagnostics(fresh);
    const errors = report.issues.filter((issue) => issue.severity === "error").length;
    const warnings = report.issues.length - errors;
    setProjectStore(fresh);
    setPending(null);
    setPickedFiles(files);
    if (connectionId !== null) localConnector.disconnect(connectionId);
    const connection = localConnector.connect(
      label ?? `Local files (${files.length} picked)`,
      Object.entries(report.counts)
        .map(([kind, count]) => `${kind}: ${count}`)
        .join(", ")
    );
    setConnectionId(connection.id);
    setConnectionStatus(`connected · synced ${connection.lastSyncAt ?? ""}`);
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setSourceTime(at);
    setSourceLabel(`${label ?? `Local files (${files.length} picked)`} · ${at}`);
    const counts = report.counts;
    const rows = Object.entries(counts)
      .map(([kind, count]) => `${kind}: ${count}`)
      .join(", ");
    setImportInfo({
      at,
      files: files.length,
      counts: rows,
      sheets: sheets.filter((sheet) => sheet.csv !== "").map((sheet) => `${sheet.file} :: ${sheet.sheet} → ${sheet.register}`),
      notes: [...sheetNotes, ...merged.notes],
      pdfs: scan.pdfFiles.length
    });
    const extras = [
      ...(sheets.some((sheet) => sheet.csv !== "")
        ? [
            `workbook sheets normalized: ${sheets
              .filter((sheet) => sheet.csv !== "")
              .map((sheet) => `${sheet.sheet} → ${sheet.register}`)
              .join(", ")}`
          ]
        : []),
      ...(scan.xlsxFiles.length > 0 && !sheets.some((sheet) => sheet.csv !== "")
        ? [`workbooks found but no sheet could be normalized — check the note details`]
        : []),
      ...(scan.pdfFiles.length > 0 ? [`${scan.pdfFiles.length} PDF(s) indexed by name only`] : []),
      ...(reference.length > 0 ? [`${reference.length} reference row(s) searchable`] : [])
    ];
    let change = "";
    if (before !== null) {
      const deltas = Object.entries(counts)
        .map(([kind, count]) => {
          const old = before[kind] ?? 0;
          return old === count ? null : `${kind} ${old}→${count}`;
        })
        .filter((delta): delta is string => delta !== null);
      change = deltas.length === 0 ? " No row-count changes since the last import." : ` Changes: ${deltas.join(", ")}.`;
    }
    setMessages((prev) => [
      {
        kind: "note",
          text: `${mode === "refresh" ? "Refreshed" : "Loaded"} local files into a session store — ${rows}. Diagnostics: ${errors} errors, ${warnings} warnings.${extras.length > 0 ? ` ${extras.join("; ")}.` : ""}${merged.missing.length > 0 ? ` Not loaded: ${merged.missing.join(", ")} — related questions will say they cannot be verified.` : ""}${change} Source notes stay synthetic in this step.`
      },
      ...prev
    ]);
    } finally {
      setLoading(false);
    }
  }

  function countRows(view: ProjectStore): Record<string, number> {
    return {
      WIR: view.wirs.length,
      MIR: view.mirs.length,
      NCR: view.ncrs.length,
      RFI: view.rfis.length,
      Drawing: view.drawings.length,
      Submittal: view.submittals.length,
      Mail: view.mails.length
    };
  }

  async function handleRefreshSource(): Promise<void> {
    if (dirHandle !== null) {
      await loadFromDirectory(dirHandle, "refresh");
      return;
    }
    if (pickedFiles.length > 0) {
      await loadFiles(pickedFiles, "refresh");
    }
  }

  function resetSource(): void {
    if (connectionId !== null) localConnector.disconnect(connectionId);
    setConnectionId(null);
    setConnectionStatus(null);
    setProjectStore(store);
    setPending(null);
    setPickedFiles([]);
    setDirHandle(null);
    setDirNeedsReconnect(false);
    setImportInfo(null);
    setSourceTime(null);
    setSourceLabel(SYNTHETIC_LABEL);
    setMessages((prev) => [{ kind: "note", text: "Restored the synthetic data." }, ...prev]);
  }

  /** Load every supported file found in a directory handle (recursive). */
  async function loadFromDirectory(
    dir: DirHandle,
    mode: "fresh" | "refresh"
  ): Promise<void> {
    setLoading(true);
    try {
      const picked = await readDirectoryFiles(dir);
      if (picked.length === 0) {
        setMessages((prev) => [
          { kind: "note", text: `The folder "${dir.name}" contains no readable files. Kept the current data.` },
          ...prev
        ]);
        return;
      }
      setDirHandle(dir);
      setDirNeedsReconnect(false);
      await loadFiles(
        picked.map((entry) => entry.file),
        mode,
        `Folder “${dir.name}” (${picked.length} files)`
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePickFolder(): Promise<void> {
    const dir = await pickDirectory();
    if (dir === null) return;
    await saveDirectory(dir);
    await loadFromDirectory(dir, "fresh");
  }

  async function handleReconnectFolder(): Promise<void> {
    if (dirHandle === null) return;
    const permission = await requestDirPermission(dirHandle);
    if (permission !== "granted") {
      setMessages((prev) => [
        { kind: "note", text: "Folder permission was not granted. Pick the folder again to reconnect." },
        ...prev
      ]);
      return;
    }
    await loadFromDirectory(dirHandle, "refresh");
  }

  // Boot: try the remembered folder (permission already granted only —
  // otherwise offer reconnect). Shows the Loading Files indicator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remembered = await loadDirectory();
      if (remembered === null) {
        // First visit (or cleared storage): explain the one-time folder step.
        if (!cancelled && hasDirectoryAccess()) {
          setMessages((prev) => [
            {
              kind: "note",
              text: "Tip: press “Load local folder” once and pick your data folder — the app will then load it automatically on every visit, with a Loading Files indicator. “Load local files” works too but must be repeated each visit."
            },
            ...prev
          ]);
        }
        return;
      }
      if (cancelled) return;
      const permission = await queryDirPermission(remembered);
      if (cancelled) return;
      if (permission !== "granted") {
        setDirHandle(remembered);
        setDirNeedsReconnect(true);
        return;
      }
      setDirHandle(remembered);
      await loadFromDirectory(remembered, "fresh");
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: auto-load runs once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClearAudit(): void {
    clearAudit();
    setAuditEntries([]);
  }

  function handleAcknowledge(watcherId: string, recordIds: string[]): void {
    acknowledgeWatcher(watcherId, recordIds);
    setPanelVersion((version) => version + 1);
  }

  function handleAction(verb: "approve" | "reject" | "execute", proposal: ActionProposal): void {
    const updated =
      verb === "approve"
        ? approveAction(proposal.id, user.userId)
        : verb === "reject"
          ? rejectAction(proposal.id, user.userId)
          : executeAction(proposal.id, user.userId).proposal;
    const ok = updated !== undefined && (verb !== "execute" || updated.status === "executed");
    logAccess({
      ts: new Date().toISOString(),
      userId: user.userId,
      question: `ACTION ${verb} ${proposal.id}`,
      verification:
        verb === "execute" && !ok
          ? "Cannot verify from available project records"
          : "Verified from available project records",
      evidenceRefs: 1,
      allowed: ok
    });
    setAuditEntries(readAudit());
    setPanelVersion((version) => version + 1);
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
        <label className="user-pill" htmlFor="user-select">
          Acting as{" "}
          <select
            id="user-select"
            className="user-select"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            {USERS.map((candidate) => (
              <option key={candidate.userId} value={candidate.userId}>
                {candidate.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="source-bar">
        <span className="context-label">Data source</span>
        <span className="source-label">{sourceLabel}</span>
        {connectionStatus !== null && sourceLabel !== SYNTHETIC_LABEL && (
          <span className="source-status">{connectionStatus}</span>
        )}
        <label className="file-btn" htmlFor="file-pick">
          Load local files
        </label>
        <input
          id="file-pick"
          className="file-input"
          type="file"
          multiple
          accept=".csv,.md,.txt,.pdf,.xlsx,.xls"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {hasDirectoryAccess() && (
          <button type="button" className="file-btn" onClick={() => void handlePickFolder()}>
            Load local folder
          </button>
        )}
        {dirNeedsReconnect && dirHandle !== null && (
          <button type="button" className="file-btn" onClick={() => void handleReconnectFolder()}>
            Reconnect “{dirHandle.name}”
          </button>
        )}
        {sourceLabel !== SYNTHETIC_LABEL && (
          <>
            <button
              type="button"
              className="chip"
              disabled={pickedFiles.length === 0 && dirHandle === null}
              onClick={() => {
                void handleRefreshSource();
              }}
            >
              Refresh files
            </button>
            <button type="button" className="chip" onClick={resetSource}>
              Reset to synthetic
            </button>
          </>
        )}
      </div>

      <main className="main">
        <div className="workspace">
          <div className="pane-left">
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

            <section className="ask-panel" aria-label="Recent questions">
              <h2>Recent — latest first</h2>
              {askedQuestions.length === 0 ? (
                <p className="muted">Your questions will appear here, newest on top.</p>
              ) : (
                <div className="history-list">
                  {askedQuestions.map((question) => (
                    <button key={question} type="button" className="chip history-chip" onClick={() => send(question)}>
                      {question}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="pane-right">

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

        <section className="ask-panel" aria-label="Monitoring">
          <h2>Monitoring — exception watchers</h2>
          <p className="engine-note">
            Checked on demand against the current data. Acknowledge records you have seen; new
            items stay highlighted.
          </p>
          <div className="watch-list">
            {watcherStates.map((state) => (
              <div key={state.def.id} className="watch-row">
                <div>
                  <strong>{state.def.label}</strong>{" "}
                  <span className={state.triggered ? "audit-denied" : "audit-ok"}>
                    {state.triggered
                      ? `${state.recordIds.length} triggered${state.newIds.length > 0 ? ` (${state.newIds.length} new)` : ""}`
                      : "clear"}
                  </span>
                  <div className="muted">{state.def.description}</div>
                  {state.triggered && (
                    <div className="rel-row">
                      {state.recordIds.map((id) => (
                        <button key={id} type="button" className="rel-chip" onClick={() => askRelated(id)}>
                          {id}
                          {state.newIds.includes(id) ? " • new" : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {state.triggered && state.newIds.length > 0 && (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => handleAcknowledge(state.def.id, state.recordIds)}
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="ask-panel" aria-label="Controlled actions">
          <h2>Controlled actions</h2>
          <p className="engine-note">
            Proposals need a recorded approval before anything executes, and execution is
            simulated locally — no external system is ever touched. Ask e.g. “Prepare an
            escalation for the overdue WIRs”, then approve and execute.
          </p>
          {actionProposals.length === 0 ? (
            <p className="muted">No action proposals yet.</p>
          ) : (
            <div className="action-list">
              {actionProposals.map((proposal) => (
                <div key={proposal.id} className="action-row">
                  <div>
                    <strong>
                      {proposal.id} · {proposal.title}
                    </strong>{" "}
                    <span className={`status-pill status-${proposal.status}`}>{proposal.status}</span>
                    <div className="muted">{proposal.detail}</div>
                    {proposal.executionNote !== undefined && (
                      <div className="muted">{proposal.executionNote}</div>
                    )}
                  </div>
                  {proposal.status === "proposed" && (
                    <div className="action-buttons">
                      <button type="button" className="mini-btn" onClick={() => handleAction("approve", proposal)}>
                        Approve
                      </button>
                      <button type="button" className="mini-btn" onClick={() => handleAction("reject", proposal)}>
                        Reject
                      </button>
                    </div>
                  )}
                  {proposal.status === "approved" && (
                    <div className="action-buttons">
                      <button type="button" className="mini-btn" onClick={() => handleAction("execute", proposal)}>
                        Execute (simulated)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="disclaimer" aria-label="Verification notice">
          AI can make mistakes. Verify important project decisions against the authoritative source
          records listed as evidence above.
        </section>

        <details className="audit" aria-label="Audit log">
          <summary>Audit log — this browser only ({auditEntries.length} entries)</summary>
          {auditEntries.length === 0 ? (
            <p className="muted">No questions recorded yet.</p>
          ) : (
            <ul className="audit-list">
              {[...auditEntries].slice(-20).reverse().map((entry, index) => (
                <li key={`${entry.ts}-${index}`}>
                  <span className={entry.allowed ? "audit-ok" : "audit-denied"}>
                    {entry.allowed ? "allowed" : "denied"}
                  </span>{" "}
                  <span className="audit-user">{entry.userId}</span> — {entry.question}{" "}
                  <span className="muted">({entry.verification}, {entry.evidenceRefs} refs)</span>
                </li>
              ))}
            </ul>
          )}
          {auditEntries.length > 0 && (
            <button type="button" className="chip" onClick={handleClearAudit}>
              Clear audit log
            </button>
          )}
        </details>

        {importInfo !== null && (
          <div className="import-report" aria-label="Last import report">
            <strong>Import report</strong> <span className="muted">· {importInfo.at}</span>
            <div>
              {importInfo.files} file(s) → {importInfo.counts}
              {importInfo.pdfs > 0 ? ` · ${importInfo.pdfs} PDF(s) by name only` : ""}
            </div>
            {importInfo.sheets.length > 0 && <div>Sheets: {importInfo.sheets.join("; ")}</div>}
            {importInfo.notes.length > 0 && (
              <details>
                <summary>{importInfo.notes.length} import note(s)</summary>
                <ul>
                  {importInfo.notes.slice(0, 8).map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
                {importInfo.notes.length > 8 && (
                  <span className="muted">…and {importInfo.notes.length - 8} more.</span>
                )}
              </details>
            )}
            {sourceTime !== null && (
              <div className="muted">Data as imported at {sourceTime} — refresh after changing files.</div>
            )}
          </div>
        )}
          </div>
        </div>
      </main>

      <footer className="footer">
        AI Site Memory · Ask the Project · synthetic demo content only — not connected to live
        project systems.
      </footer>

      {loading && (
        <div className="loading-overlay" role="status" aria-label="Loading files">
          <div className="hourglass" aria-hidden="true">
            ⏳
          </div>
          <div className="loading-caption">Loading Files..</div>
        </div>
      )}
    </div>
  );
}
