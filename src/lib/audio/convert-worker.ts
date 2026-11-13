/**
 * ALLOY — THE IMPORT CONVERSION WORKER — Task 11.1.
 *
 * The browser-only half of the conversion stage's wiring. The Worker itself
 * (import.worker.ts) runs the same pure functions Node tests run inline;
 * this module owns the queue and the progress messages. A conversion never
 * blocks on the Worker's birth: the first call starts it (a memoised
 * promise) and awaits readiness, and an environment without Workers — the
 * Node tests, SSR — falls back to the in-thread stage for that call, and
 * the next, without a cached failure.
 *
 * One worker, one conversion at a time (the import pipeline is per-file
 * serial anyway); the queue is a promise chain, so the caller's await order
 * is the arrival order whatever the browser schedules.
 */

import { convertToProjectRate, type ConversionResult } from "./convert";
import type { Converter } from "../project/import";

interface Pending {
  resolve: (r: ConversionResult) => void;
  reject: (e: Error) => void;
  onProgress: (f: number) => void;
}

/**
 * The Worker-backed conversion stage. Synchronous to create (the shell stays
 * synchronous); each call awaits the worker's readiness, and a worker that
 * cannot be born falls back to the in-thread stage for that call.
 */
export function createWorkerConverter(): Converter {
  let booting: Promise<Worker> | null = null;
  let worker: Worker | null = null;
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let chain: Promise<unknown> = Promise.resolve();

  const boot = (): Promise<Worker> => {
    worker?.addEventListener;
    return (booting ??= (async () => {
      const Ctor = (await import("./import.worker.ts?worker&inline")).default;
      const w = new Ctor();
      w.addEventListener("message", (event: MessageEvent) => {
        const data = event.data as { id: number; type: string; fraction?: number; result?: ConversionResult; message?: string };
        const entry = pending.get(data.id);
        if (!entry) return;
        if (data.type === "progress") entry.onProgress(data.fraction ?? 0);
        else if (data.type === "done" && data.result) {
          pending.delete(data.id);
          entry.resolve(data.result);
        } else if (data.type === "error") {
          pending.delete(data.id);
          entry.reject(new Error(data.message ?? "the conversion worker failed"));
        }
      });
      worker = w;
      return w;
    })());
  };

  return (bytes: Uint8Array, projectRate: number, onProgress: (f: number) => void): Promise<ConversionResult> => {
    const job = chain.then(async () => {
      let w: Worker;
      try {
        w = await boot();
      } catch {
        // no Workers here: the in-thread stage, this call and the next
        return convertToProjectRate(bytes, projectRate, { onStageProgress: onProgress });
      }
      return new Promise<ConversionResult>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject, onProgress });
        const copy = new Uint8Array(bytes); // the transfer detaches; the caller keeps its own
        w.postMessage({ id, bytes: copy, projectRate }, [copy.buffer]);
      });
    });
    chain = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  };
}
