/**
 * Optional local-folder access (progressive enhancement).
 * Lets the user point the app at a folder (e.g. local-data) once; the
 * directory handle persists in IndexedDB so the app can offer one-click
 * reload on boot. Browser security rules apply and are respected:
 * - initial picking and permission grants always need a user gesture;
 * - boot-time reuse only proceeds when permission is already granted;
 * - otherwise the app shows a "Reconnect folder" button instead of failing;
 * - everything stays on the user's computer; handles are opaque tokens.
 * All functions are safe no-ops outside supporting browsers (and tests).
 */

export interface PickedFile {
  file: File;
}

const DB_NAME = "asm-local-dir";
const DB_STORE = "handles";
const DB_KEY = "last-dir";
const MAX_FILES = 300;
const MAX_DEPTH = 3;

/**
 * Minimal structural types for the File System Access API (avoids depending
 * on DOM-lib declarations, which vary by TypeScript version).
 */
export interface DirHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<FileHandle>;
  queryPermission?(descriptor?: { mode?: string }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: string }): Promise<PermissionState>;
}

export interface FileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}

type DirectoryPicker = (options?: { id?: string; mode?: string }) => Promise<DirHandle>;

function picker(): DirectoryPicker | null {
  try {
    if (typeof window === "undefined") return null;
    const candidate = (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export function hasDirectoryAccess(): boolean {
  return picker() !== null;
}

export async function pickDirectory(): Promise<DirHandle | null> {
  const show = picker();
  if (show === null) return null;
  try {
    return await show({ id: "asm-local-data", mode: "read" });
  } catch {
    return null;
  }
}

function idb(): Promise<IDBDatabase | null> {
  try {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveDirectory(handle: DirHandle): Promise<void> {
  const db = await idb();
  if (db === null) return;
  try {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(handle, DB_KEY);
  } catch {
    // Persistence unavailable — folder works for this session only.
  }
}

export async function loadDirectory(): Promise<DirHandle | null> {
  const db = await idb();
  if (db === null) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => {
        const handle = request.result as DirHandle | undefined;
        resolve(handle !== undefined && handle.kind === "directory" ? handle : null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function clearDirectory(): Promise<void> {
  const db = await idb();
  if (db === null) return;
  try {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(DB_KEY);
  } catch {
    // Nothing to clear.
  }
}

export type DirPermission = "granted" | "prompt" | "denied" | "unavailable";

/** Query current permission without prompting (safe at boot). */
export async function queryDirPermission(handle: DirHandle): Promise<DirPermission> {
  try {
    if (handle.queryPermission === undefined) return "unavailable";
    const state = await handle.queryPermission({ mode: "read" });
    if (state === "granted" || state === "denied" || state === "prompt") return state;
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Request permission — must run inside a user gesture (button click). */
export async function requestDirPermission(handle: DirHandle): Promise<DirPermission> {
  try {
    if (handle.requestPermission === undefined) return "unavailable";
    const state = await handle.requestPermission({ mode: "read" });
    if (state === "granted" || state === "denied" || state === "prompt") return state;
    return "unavailable";
  } catch {
    return "denied";
  }
}

/** Read files recursively (bounded); callers classify and import. */
export async function readDirectoryFiles(
  dir: DirHandle,
  depth = 0
): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  try {
    const entries: Array<DirHandle | FileHandle> = [];
    for await (const entry of dir.values()) {
      entries.push(entry);
      if (out.length + entries.length > MAX_FILES) break;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) break;
      if (entry.kind === "file") {
        try {
          out.push({ file: await (entry as FileHandle).getFile() });
        } catch {
          // Unreadable file — skipped, reported by the import notes.
        }
      } else if (entry.kind === "directory" && depth < MAX_DEPTH) {
        out.push(...(await readDirectoryFiles(entry as DirHandle, depth + 1)));
      }
    }
  } catch {
    // Unreadable directory — caller reports it.
  }
  return out.slice(0, MAX_FILES);
}
