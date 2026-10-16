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
import { checkAccess, getDemoUser } from "./lib/access";
import {
  AUTH_ERROR,
  allowEmail,
  createAccount,
  currentSessionEmail,
  getRestrictedEmails,
  isAdmin,
  listAccounts,
  login,
  logout,
  removeAccount,
  restrictEmail
} from "./lib/auth";
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

const SEARCH_HINT =
  "Type a keyword or MIR or WIR reference number or venue name or location to begin. Operators: AND (space), OR, -NOT, \"exact phrase\".";

const GREETING =
  "Super-search over the loaded project records. I answer only from available records, show evidence, and say so when something cannot be verified.";

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

function AuthGate({ onAuthed }: { onAuthed: (email: string) => void }): JSX.Element {
  const [mode, setMode] = useState<"login" | "create">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent): void {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // Small async beat so the button -> error/success transition animates.
    window.setTimeout(() => {
      const result = mode === "login" ? login(email, password) : createAccount(email, password);
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? AUTH_ERROR);
        return;
      }
      const session = currentSessionEmail();
      if (session !== null) onAuthed(session);
    }, 120);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" aria-label="Log in">
        <div className="mark" aria-hidden="true">
          ASM
        </div>
        <h1>AI Site Memory</h1>
        <p className="muted">Ask the Project — log in with your project email.</p>
        <div className="auth-tabs" role="tablist" aria-label="Login or create account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={mode === "create" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setMode("create");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label className="auth-label" htmlFor="auth-email">
            Email
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@alec.ae"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="auth-label" htmlFor="auth-password">
            Password
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={5}
              placeholder={mode === "login" ? "Your password" : "Min 5 characters"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error !== null && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? "Checking…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <p className="engine-note">Project emails only — @alec.ae. Saved on this device for now.</p>
      </div>
    </div>
  );
}

function AdminPanel({
  adminEmail,
  onDataAction
}: {
  adminEmail: string;
  onDataAction: (action: "clear-log" | "reset-data") => void;
}): JSX.Element {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const accounts = listAccounts(adminEmail);
  const restricted = getRestrictedEmails();
  void version;

  function refresh(message: string): void {
    setVersion((value) => value + 1);
    setNotice(message);
    setEmail("");
  }

  return (
    <section className="ask-panel admin-panel" aria-label="Admin controls">
      <h2>Admin — {adminEmail}</h2>
      <p className="engine-note">Full access for all @alec.ae. Restrict / allow emails below.</p>
      <form
        className="ask-row"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@alec.ae"
          aria-label="Admin email target"
        />
        <div className="action-buttons">
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              const result = restrictEmail(adminEmail, email);
              refresh(result.ok ? `Restricted ${email.trim().toLowerCase()}.` : (result.error ?? AUTH_ERROR));
            }}
          >
            Restrict
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              const result = allowEmail(adminEmail, email);
              refresh(result.ok ? `Allowed ${email.trim().toLowerCase()}.` : (result.error ?? AUTH_ERROR));
            }}
          >
            Allow
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => {
              const result = removeAccount(adminEmail, email);
              refresh(result.ok ? `Removed ${email.trim().toLowerCase()}.` : (result.error ?? AUTH_ERROR));
            }}
          >
            Remove
          </button>
        </div>
      </form>
      {notice !== null && <p className="search-status">{notice}</p>}
      <div className="muted">
        {accounts.length} account(s) · {restricted.length} restricted
      </div>
      {accounts.length > 0 && (
        <ul className="audit-list">
          {accounts.map((account) => (
            <li key={account.email}>
              {account.email}{" "}
              <span className="muted">
                {restricted.includes(account.email) ? "restricted" : "allowed"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="action-buttons">
        <button type="button" className="chip" onClick={() => onDataAction("clear-log")}>
          Clear log
        </button>
        <button type="button" className="chip" onClick={() => onDataAction("reset-data")}>
          Reset data
        </button>
      </div>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface LoadedFileMeta {
  name: string;
  size: number;
}

function countByStatus(items: Array<{ status: string }>): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.status === "" ? "Unrecorded" : item.status;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Pure-SVG bar chart (no new dependencies) for WIR/MIR status counts. */
function StatusBars({ rows, total }: { rows: Array<[string, number]>; total: number }): JSX.Element {
  if (rows.length === 0 || total === 0) return <p className="muted">No records.</p>;
  const max = Math.max(...rows.map(([, count]) => count));
  return (
    <div className="bars" role="img" aria-label={`Status chart, ${total} records`}>
      {rows.slice(0, 8).map(([status, count]) => (
        <div key={status} className="bar-row">
          <span className="bar-label">{status}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(4, Math.round((count / max) * 100))}%` }} />
          </span>
          <span className="bar-count">{count}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardPanel({ view }: { view: ProjectStore }): JSX.Element {
  const wirRows = countByStatus(view.wirs);
  const mirRows = countByStatus(view.mirs);
  const overdue = view.wirs.filter((wir) => wir.status.toLowerCase().includes("overdue")).length;
  const draftMirs = view.mirs.filter((mir) => mir.status === "Draft").length;
  return (
    <section className="ask-panel" aria-label="WIR and MIR dashboard">
      <h2>Dashboard — WIR / MIR</h2>
      <p className="engine-note">
        {view.wirs.length} WIRs · {view.mirs.length} MIRs · {overdue} overdue · {draftMirs} draft MIRs
      </p>
      <div className="dash-grid">
        <div>
          <h3>WIR by status ({view.wirs.length})</h3>
          <StatusBars rows={wirRows} total={view.wirs.length} />
          <table className="dash-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {wirRows.map(([status, count]) => (
                <tr key={status}>
                  <td>{status}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>MIR by status ({view.mirs.length})</h3>
          <StatusBars rows={mirRows} total={view.mirs.length} />
          <table className="dash-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {mirRows.map(([status, count]) => (
                <tr key={status}>
                  <td>{status}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FilesPanel({
  files,
  sourceLabelText,
  counts
}: {
  files: LoadedFileMeta[];
  sourceLabelText: string;
  counts: string;
}): JSX.Element {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    <section className="ask-panel" aria-label="Loaded files statistics">
      <h2>Loaded files</h2>
      <p className="engine-note">
        {sourceLabelText} · {files.length} file(s) · {formatBytes(totalBytes)} · {counts === "" ? "no records" : counts}
      </p>
      {files.length === 0 ? (
        <p className="muted">Synthetic demo bundle — no local files picked. Use Load local files.</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.name}>
                <td>{file.name}</td>
                <td>{formatBytes(file.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function App(): JSX.Element {
  const [sessionEmail, setSessionEmail] = useState<string | null>(() => currentSessionEmail());
  const [messages, setMessages] = useState<ChatMessage[]>([{ kind: "note", text: GREETING }]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingTopic | null>(null);
  const user = getDemoUser();
  const [lastRecordId, setLastRecordId] = useState<string | null>(null);
  const [projectStore, setProjectStore] = useState<ProjectStore>(store);
  const [sourceLabel, setSourceLabel] = useState(SYNTHETIC_LABEL);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
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
  const [answering, setAnswering] = useState(false);
  const [fileMeta, setFileMeta] = useState<LoadedFileMeta[]>([]);
  const [rightView, setRightView] = useState<"search" | "dashboard">("search");
  const [adminTab, setAdminTab] = useState<"search" | "files" | "users">("search");
  const watcherStates = useMemo(() => evaluateWatchers(projectStore), [projectStore, panelVersion]);
  const actionProposals = useMemo(() => listActions().slice().reverse(), [panelVersion]);

  function recordAudit(question: string, answer: Answer, allowed: boolean): void {
    logAccess({
      ts: new Date().toISOString(),
      userId: sessionEmail ?? user.userId,
      question,
      verification: answer.verification,
      evidenceRefs: answer.evidence.length,
      allowed
    });
    setAuditEntries(readAudit());
  }

  function send(raw: string): void {
    const text = raw.trim();
    if (text === "" || answering) return;
    // Latest search stays on top; previous searches move down.
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
    // Smooth Ask -> loading -> answer transition (short beat, then render).
    setAnswering(true);
    window.setTimeout(() => {
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
      setAnswering(false);
    }, 160);
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
      // Per-file outcomes: a file that cannot even be read (e.g. an
      // online-only OneDrive placeholder, or an unnamed folder entry the
      // picker handed over) must say so explicitly instead of vanishing.
      const readNotes: string[] = [];
      for (const file of files) {
        const displayName = file.name === "" ? "(unnamed entry)" : file.name;
        if (file.size === 0) {
          readNotes.push(
            `${displayName}: file arrived empty (0 bytes) — if it lives in OneDrive, open it in the OneDrive app first so it fully downloads to the device, then pick the downloaded file again. Folders cannot be picked with "Load local files"; pick the files themselves.`
          );
          continue;
        }
        try {
          const kind = classifyFile(file.name);
          const name = uniqueName(displayName);
          if (kind === "csv") scan.csvFiles[name] = await file.text();
          else if (kind === "text") scan.textDocs[name] = await file.text();
          else if (kind === "pdf") scan.pdfFiles.push(name);
          else if (kind === "xlsx") {
            scan.xlsxFiles.push(name);
            xlsxFiles.push(file);
          } else scan.otherFiles.push(name);
        } catch {
          readNotes.push(
            `${displayName}: could not be read on this device — download it fully first (OneDrive files must be available offline), then pick it again.`
          );
        }
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
      }
      setMessages((prev) => [
        {
          kind: "note",
          text: `Could not load local files [${files.map((file) => file.name === "" ? "(unnamed entry)" : file.name).join(", ")}]: no register source found for ${merged.missing.join(", ")}. Needed: CSVs or workbook sheets matching wir, mir, ncr, rfi, drawing, submittal or mail. Kept the current data.${readNotes.length > 0 ? ` File problems: ${readNotes.join(" ")}` : ""}${merged.notes.length > 0 ? ` Details: ${merged.notes.join(" ")}` : ""}`
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
    setFileMeta(
      files.map((file) => ({
        name: file.name === "" ? "(unnamed entry)" : file.name,
        size: file.size
      }))
    );
    if (connectionId !== null) localConnector.disconnect(connectionId);
    const connection = localConnector.connect(
      label ?? `Local files (${files.length} picked)`,
      Object.entries(report.counts)
        .map(([kind, count]) => `${kind}: ${count}`)
        .join(", ")
    );
    setConnectionId(connection.id);
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
          text: `${mode === "refresh" ? "Refreshed" : "Loaded"} local files into a session store — ${rows}. Diagnostics: ${errors} errors, ${warnings} warnings.${extras.length > 0 ? ` ${extras.join("; ")}.` : ""}${merged.missing.length > 0 ? ` Not loaded: ${merged.missing.join(", ")} — related questions will say they cannot be verified.` : ""}${readNotes.length > 0 ? ` File problems: ${readNotes.join(" ")}` : ""}${change} Source notes stay synthetic in this step.`
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
    setProjectStore(store);
    setPending(null);
    setPickedFiles([]);
    setFileMeta([]);
    setDirHandle(null);
    setDirNeedsReconnect(false);
    setImportInfo(null);
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
    const actor = sessionEmail ?? user.userId;
    const updated =
      verb === "approve"
        ? approveAction(proposal.id, actor)
        : verb === "reject"
          ? rejectAction(proposal.id, actor)
          : executeAction(proposal.id, actor).proposal;
    const ok = updated !== undefined && (verb !== "execute" || updated.status === "executed");
    logAccess({
      ts: new Date().toISOString(),
      userId: actor,
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

  function handleLogout(): void {
    logout();
    setSessionEmail(null);
  }

  if (sessionEmail === null) {
    return (
      <div className="app">
        <AuthGate onAuthed={(email) => setSessionEmail(email)} />
      </div>
    );
  }

  const recordCount =
    projectStore.wirs.length +
    projectStore.mirs.length +
    projectStore.ncrs.length +
    projectStore.rfis.length +
    projectStore.drawings.length +
    projectStore.submittals.length +
    projectStore.mails.length;
  const shortSource =
    sourceLabel === SYNTHETIC_LABEL ? "Demo data" : sourceLabel.split("·")[0]?.trim() ?? "Local files";
  const shortStatus =
    loading ? "Loading…" : answering ? "Searching…" : `${recordCount} records`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="mark" aria-hidden="true">
          ASM
        </div>
        <div>
          <h1>AI Site Memory</h1>
          <p className="subtitle">Ask the Project</p>
        </div>
      </header>

      <div className="context-bar">
        <span className="project-pill">{DEMO_PROJECT.name}</span>
        <span className="user-pill">
          {sessionEmail}{" "}
          <button type="button" className="chip" onClick={handleLogout}>
            Log out
          </button>
        </span>
      </div>

      {isAdmin(sessionEmail) && (
        <div className="admin-tabs" role="tablist" aria-label="Admin views">
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === "search"}
            className={adminTab === "search" ? "auth-tab active" : "auth-tab"}
            onClick={() => setAdminTab("search")}
          >
            Super-search
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === "files"}
            className={adminTab === "files" ? "auth-tab active" : "auth-tab"}
            onClick={() => setAdminTab("files")}
          >
            Files & stats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === "users"}
            className={adminTab === "users" ? "auth-tab active" : "auth-tab"}
            onClick={() => setAdminTab("users")}
          >
            Users
          </button>
        </div>
      )}

      <div className="source-bar minimal">
        <span className="source-label">{shortSource}</span>
        <span className="source-status">{shortStatus}</span>
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

      <main className="main minimal">
        <div className="workspace">
          <div className="pane-left">
            <section className="ask-panel" aria-label="Super-search">
          <h2>Super-Search</h2>
          <form className="ask-row" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Keyword, MIR/WIR number, venue, location…"
              aria-label="Super-search query"
            />
            <button className="btn-primary" type="submit" disabled={answering}>
              {answering ? "…" : "Ask"}
            </button>
          </form>
          <button
            type="button"
            className="chip dashboard-toggle"
            onClick={() => setRightView((view) => (view === "search" ? "dashboard" : "search"))}
          >
            {rightView === "search" ? "Dashboard" : "Back to search"}
          </button>
          {answering && (
            <p className="search-status" role="status" aria-live="polite">
              Searching…
            </p>
          )}
          <p className="engine-note">{SEARCH_HINT}</p>
        </section>

            <section className="ask-panel" aria-label="Recent questions">
              <h2>Recent</h2>
              {askedQuestions.length === 0 ? (
                <p className="muted">Newest on top.</p>
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
        {isAdmin(sessionEmail) && adminTab === "files" ? (
          <>
            <FilesPanel
              files={fileMeta}
              sourceLabelText={shortSource}
              counts={importInfo?.counts ?? `${recordCount} records`}
            />
            <DashboardPanel view={projectStore} />
          </>
        ) : isAdmin(sessionEmail) && adminTab === "users" ? (
          <AdminPanel
            adminEmail={sessionEmail}
            onDataAction={(action) => {
              if (action === "clear-log") handleClearAudit();
              else resetSource();
            }}
          />
        ) : rightView === "dashboard" ? (
          <DashboardPanel view={projectStore} />
        ) : (
        <>
        <section className="thread" aria-label="Conversation" aria-live="polite">
          {messages.map((message, index) => {
            if (message.kind === "user") {
              return (
                <div key={index} className="user-msg enter">
                  {message.text}
                </div>
              );
            }
            if (message.kind === "note") {
              return (
                <div key={index} className="note-msg enter">
                  {message.text}
                </div>
              );
            }
            return (
              <div key={index} className="enter">
                <AnswerCard answer={message.answer} onRelatedClick={askRelated} />
              </div>
            );
          })}
        </section>

        <details className="advanced" aria-label="Advanced details">
          <summary>Advanced — monitoring, actions, logs</summary>
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
          AI can make mistakes — verify against source records.
        </section>

        <details className="audit" aria-label="Audit log">
          <summary>Log ({auditEntries.length})</summary>
          {auditEntries.length === 0 ? (
            <p className="muted">Empty.</p>
          ) : (
            <ul className="audit-list">
              {[...auditEntries].slice(-10).reverse().map((entry, index) => (
                <li key={`${entry.ts}-${index}`}>
                  <span className={entry.allowed ? "audit-ok" : "audit-denied"}>
                    {entry.allowed ? "ok" : "denied"}
                  </span>{" "}
                  {entry.question}{" "}
                  <span className="muted">({entry.evidenceRefs} refs)</span>
                </li>
              ))}
            </ul>
          )}
          {auditEntries.length > 0 && (
            <button type="button" className="chip" onClick={handleClearAudit}>
              Clear
            </button>
          )}
        </details>

        {importInfo !== null && (
          <div className="import-report" aria-label="Last import report">
            <strong>Import</strong> <span className="muted">· {importInfo.at}</span>
            <div>
              {importInfo.files} files · {importInfo.counts}
              {importInfo.pdfs > 0 ? ` · ${importInfo.pdfs} PDFs (names only)` : ""}
            </div>
          </div>
        )}
        </details>
        </>
        )}
          </div>
        </div>
      </main>

      <footer className="footer">AI Site Memory · Ask the Project</footer>

      {loading && (
        <div className="loading-overlay" role="status" aria-label="Loading files">
          <div className="hourglass" aria-hidden="true">
            ⏳
          </div>
          <div className="loading-caption">Loading…</div>
        </div>
      )}
    </div>
  );
}
