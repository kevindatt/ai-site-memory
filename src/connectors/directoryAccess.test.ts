import { describe, expect, it } from "vitest";
import type { DirHandle, FileHandle } from "./directoryAccess";
import {
  hasDirectoryAccess,
  loadDirectory,
  pickDirectory,
  readDirectoryFiles
} from "./directoryAccess";

describe("directory access guards (non-browser runtime)", () => {
  it("reports no directory API and resolves null safely", async () => {
    expect(hasDirectoryAccess()).toBe(false);
    expect(await pickDirectory()).toBeNull();
    expect(await loadDirectory()).toBeNull();
  });

  it("reads nothing from an unreadable handle", async () => {
    const broken: DirHandle = {
      kind: "directory",
      name: "x",
      values: (): AsyncIterable<FileHandle> => {
        throw new Error("no access");
      }
    };
    expect(await readDirectoryFiles(broken)).toEqual([]);
  });
});
