/**
 * ALLOY — where an export is written (Task 8.2).
 *
 * Three destinations, one contract:
 *
 *   - `directorySink` — a real folder, through the File System Access API
 *     (`showDirectoryPicker`). This is plan §12's "user-selected destination
 *     folder", and it writes files one by one, each committed only when its WAV
 *     header is patched.
 *   - `memorySink` — an in-memory tree. The tests' destination; it also proves the
 *     exporter never needs a browser.
 *   - `collectSink` — writes nothing and hands each finished file back to the
 *     caller. This is the fallback for a browser without the picker (Safari,
 *     Firefox): the shell turns each file into a download.
 *
 * Nothing here is a second export pipeline: every destination is just a byte
 * sink per file (`createFile` → `ByteSink`). The exporter owns the audio and the
 * naming; the destination owns the storage.
 */

import { CursorBuffer, WavSinkError, type ByteSink } from "./encode";

export interface ExportFileSink extends ByteSink {
  /** Flush and close the file, committing exactly what was written. */
  close(): Promise<void>;
  /** Discard the partial file. Never throws. */
  abort(): Promise<void>;
}

export interface ExportDestination {
  readonly kind: "directory" | "memory" | "collect";
  /** A print of where this export goes, for the UI and the manifest. */
  readonly print: string;
  /** Create (and truncate) one file at a path relative to the export folder. */
  createFile(relativePath: string): Promise<ExportFileSink>;
  /** Write a small text file (the manifest). */
  writeText(relativePath: string, text: string): Promise<void>;
  /** Every file path this destination now holds, for evidence and tests. */
  files(): readonly string[];
}

/* --- memory ----------------------------------------------------------------------------- */

export interface MemoryDestination extends ExportDestination {
  read(relativePath: string): Uint8Array | null;
  readText(relativePath: string): string | null;
}

export function memoryDestination(): MemoryDestination {
  const blobs = new Map<string, Uint8Array>();
  const texts = new Map<string, string>();

  const sinkFor = (path: string): ExportFileSink => {
    const buffer = new CursorBuffer();
    let done = false;
    return {
      write(chunk) {
        if (done) throw new WavSinkError(`${path} is closed`);
        buffer.write(chunk);
      },
      seek(position) {
        buffer.seek(position);
      },
      async close() {
        if (done) return;
        // Copy: the WAV header patch seeks back to byte 0 and overwrites in place.
        blobs.set(path, buffer.bytes());
        done = true;
      },
      async abort() {
        done = true;
        blobs.delete(path);
      },
    };
  };

  return {
    kind: "memory",
    print: "In memory",
    async createFile(path) {
      return sinkFor(path);
    },
    async writeText(path, text) {
      texts.set(path, text);
    },
    files() {
      return [...blobs.keys(), ...texts.keys()];
    },
    read(path) {
      return blobs.get(path) ?? null;
    },
    readText(path) {
      return texts.get(path) ?? null;
    },
  };
}

/* --- collect (the download fallback) ---------------------------------------------------- */

export interface CollectedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface CollectDestination extends ExportDestination {
  readonly collected: readonly CollectedFile[];
  readonly texts: ReadonlyMap<string, string>;
  /** Optional hook the shell uses to start a download as each file completes. */
  onFile?: (file: CollectedFile) => void | Promise<void>;
}

export function collectDestination(): CollectDestination {
  const collected: CollectedFile[] = [];
  const texts = new Map<string, string>();
  const destination: CollectDestination = {
    kind: "collect",
    print: "Downloaded",
    collected,
    texts,
    async createFile(path) {
      const buffer = new CursorBuffer();
      let done = false;
      return {
        write(chunk) {
          if (done) throw new WavSinkError(`${path} is closed`);
          buffer.write(chunk);
        },
        seek(position) {
          buffer.seek(position);
        },
        async close() {
          if (done) return;
          done = true;
          const file: CollectedFile = { path, bytes: buffer.bytes() };
          collected.push(file);
          await destination.onFile?.(file);
        },
        async abort() {
          done = true;
        },
      };
    },
    async writeText(path, text) {
      texts.set(path, text);
    },
    files() {
      return [...collected.map((file) => file.path), ...texts.keys()];
    },
  };
  return destination;
}

/* --- a real directory (File System Access API) ------------------------------------------ */

/** The subset of `FileSystemDirectoryHandle` an export uses. */
export interface DirectoryHandleLike {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
}

export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}

export interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

/**
 * A real folder. Paths are created lazily (`Stems/`, `Buses/`), each file gets its
 * own writable stream, and `close()` is the commit point. A failure inside a file
 * aborts that writable so a half-written WAV is discarded rather than left in the
 * folder looking complete.
 */
export function directoryDestination(root: DirectoryHandleLike, label?: string): ExportDestination {
  const written: string[] = [];

  const directoryFor = async (segments: readonly string[]): Promise<DirectoryHandleLike> => {
    let handle = root;
    for (const segment of segments) handle = await handle.getDirectoryHandle(segment, { create: true });
    return handle;
  };

  return {
    kind: "directory",
    print: label ?? `Folder “${root.name}”`,
    async createFile(relativePath) {
      const segments = relativePath.split("/");
      const name = segments.pop() as string;
      const directory = await directoryFor(segments);
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      let open = true;
      return {
        async write(chunk) {
          if (!open) throw new WavSinkError(`${relativePath} is closed`);
          await writable.write(chunk);
        },
        async seek(position) {
          // FileSystemWritableFileStream accepts a position on write; the WAV
          // header patch is the only seek, and it always targets byte 0.
          if (position !== 0) throw new WavSinkError(`the file system sink seeks only to the start of ${relativePath}`);
          await writable.write({ type: "seek", position } as unknown as Uint8Array);
        },
        async close() {
          if (!open) return;
          open = false;
          await writable.close();
          written.push(relativePath);
        },
        async abort() {
          if (!open) return;
          open = false;
          try {
            await writable.abort?.();
          } catch {
            // Discarding is best-effort; the export's own error is what is reported.
          }
        },
      };
    },
    async writeText(relativePath, text) {
      const segments = relativePath.split("/");
      const name = segments.pop() as string;
      const directory = await directoryFor(segments);
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(new TextEncoder().encode(text));
        await writable.close();
        written.push(relativePath);
      } catch (error) {
        await writable.abort?.().catch(() => undefined);
        throw error;
      }
    },
    files() {
      return [...written];
    },
  };
}
