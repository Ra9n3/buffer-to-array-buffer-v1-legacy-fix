/**
 * ALLOY — the conversion stage inside its Worker — Task 11.1.
 *
 * Pure: the same convertToProjectRate the Node tests run inline, with the
 * same progress contract, answering the main thread's {id, bytes, rate}
 * jobs with {id, done, result} / {id, progress, fraction} / {id, error}.
 * No state, no timers, no randomness — the output for one input is
 * byte-identical to the in-thread stage (the tests assert it).
 */

import { convertToProjectRate, type ConversionResult } from "./convert";

export type ImportWorkerRequest =
  | { readonly id: number; readonly bytes: Uint8Array; readonly projectRate: number };

const post = (message: unknown, transfer?: Transferable[]): void => {
  (self as unknown as Worker).postMessage(message, transfer ?? []);
};

(self as unknown as Worker).addEventListener("message", (event: MessageEvent<ImportWorkerRequest>) => {
  const { id, bytes, projectRate } = event.data;
  void convertToProjectRate(bytes, projectRate, {
    onStageProgress: (fraction) => post({ id, type: "progress", fraction }),
  }).then(
    (result: ConversionResult) => {
      const converted = new Uint8Array(result.bytes); // transferred, not cloned
      post({ id, type: "done", result: { ...result, bytes: converted } }, [converted.buffer]);
    },
    (error: unknown) => {
      post({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
    },
  );
});
