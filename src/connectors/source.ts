/**
 * Common source-connector interface (Phase C/E).
 * Every current and future data source — synthetic bundle, local files,
 * OneDrive, Google Drive, Aconex, Egnyte — presents the same lifecycle:
 * connect, list, refresh, disconnect. Retrieval code only ever sees the
 * normalized project records plus these connection states; it never talks
 * to a source system directly. Sources that lose authorization must
 * disconnect (removing their imported content) rather than serve stale data.
 */

export type SourceKind =
  | "synthetic"
  | "local-files"
  | "onedrive"
  | "googledrive"
  | "aconex"
  | "egnyte";

export type ConnectionStatus = "connected" | "stale" | "error" | "disconnected";

export interface ConnectedSource {
  id: string;
  kind: SourceKind;
  label: string;
  status: ConnectionStatus;
  /** ISO timestamp of the last successful import/refresh, if any. */
  lastSyncAt: string | null;
  detail: string;
}

export interface SourceConnector {
  readonly kind: SourceKind;
  connect(label: string, detail: string): ConnectedSource;
  refresh(id: string, detail: string): ConnectedSource | undefined;
  markStale(id: string, detail: string): ConnectedSource | undefined;
  disconnect(id: string): void;
  list(): ConnectedSource[];
}

/** In-memory registry; only the synthetic + local-files kinds are active. */
export class LocalSourceConnector implements SourceConnector {
  readonly kind: SourceKind;
  private readonly sources = new Map<string, ConnectedSource>();
  private counter = 0;

  constructor(kind: Extract<SourceKind, "synthetic" | "local-files">) {
    this.kind = kind;
  }

  connect(label: string, detail: string): ConnectedSource {
    this.counter += 1;
    const source: ConnectedSource = {
      id: `${this.kind}-${this.counter}`,
      kind: this.kind,
      label,
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      detail
    };
    this.sources.set(source.id, source);
    return source;
  }

  refresh(id: string, detail: string): ConnectedSource | undefined {
    const source = this.sources.get(id);
    if (source === undefined) return undefined;
    const updated: ConnectedSource = {
      ...source,
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      detail
    };
    this.sources.set(id, updated);
    return updated;
  }

  markStale(id: string, detail: string): ConnectedSource | undefined {
    const source = this.sources.get(id);
    if (source === undefined) return undefined;
    const updated: ConnectedSource = { ...source, status: "stale", detail };
    this.sources.set(id, updated);
    return updated;
  }

  disconnect(id: string): void {
    this.sources.delete(id);
  }

  list(): ConnectedSource[] {
    return [...this.sources.values()];
  }
}
