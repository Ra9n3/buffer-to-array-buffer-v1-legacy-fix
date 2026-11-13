/**
 * ALLOY — WAV export (Task 8.2).
 *
 * Plan §12: any combination of the full mix, the processed individual stems and
 * the processed buses, as WAV, into a folder the user chooses. This module owns
 * the orchestration and the file contract; it owns no audio processing and no
 * storage.
 *
 *   - **Rendering is Task 7.4's `renderProject`.** One `MixEngine` per file, the
 *     same chains, the same summing, the same Return tails, the same limiter and
 *     the same latency compensation the transport already uses. There is no second
 *     export pipeline, no parallel mixer and no re-implementation of the graph.
 *   - **Storage is a `ExportDestination`** (a real folder, memory, or a collector
 *     the shell turns into downloads).
 *   - **Encoding is `WavStreamWriter`** — a bounded, streaming WAV writer, because a
 *     render never holds a whole file in memory.
 *
 * WHAT EACH FILE CONTAINS
 *
 *   full mix   the complete signal path: every track's inserts, its post-fader
 *              sends into the Returns, the Returns' effects, the bus chains and
 *              their summing — through the master's safety limiter. No mastering:
 *              the limiter is the engine's overs guard (§15.6), not a loudness stage,
 *              and nothing else touches the samples.
 *   stem       one pass per track, with exactly that track's inserts applied, its
 *              own sends into the Returns and its own pan/fader — i.e. the same
 *              chain it runs in the mix. Bus processing is NOT in a stem (the bus is
 *              a different file, and the manifest says so per stem, per plan §12).
 *   bus        read from the bus monitor tap of the full-mix pass: the bus after its
 *              own chain and before it is summed into its destination. That makes
 *              "the sum of the bus taps that feed Master" exactly the master signal
 *              before the safety limiter, which the tests assert.
 *
 * Everything is deterministic: same project, same sources → same bytes. Progress is
 * reported per file and overall; a file that fails is reported and the export
 * continues, except for a format or destination failure, which cannot be recovered
 * by writing the next file.
 */

import {
  renderProject,
  RenderCancelledError,
  RenderProjectChangedError,
  type RenderSource,
} from "../engine/render";
import { CONVERSION_NOTICE } from "../audio/import-rules";
import { printRateChange } from "../audio/rates";
import type { MaskingDynamicBand } from "../engine/chains";
import type { BusId, Project, TrackId } from "../project/model";
import {
  DEFAULT_EXPORT_FORMAT,
  WavStreamWriter,
  peakOf,
  type DitherSetting,
  type ExportFormat,
} from "./encode";
import { RateStageWriter } from "./rate-stage";
import type { ExportDestination } from "./destination";
import {
  NO_SELECTION_MESSAGE,
  buildManifest,
  busesWithSignal,
  planExport,
  selectedOutputs,
  stemRouting,
  type ExportFailure,
  type ExportFailureReason,
  type ExportJob,
  type ExportJobKind,
  type ExportManifest,
  type ExportOutput,
  type ExportPlan,
  type ExportSelection,
} from "./plan";
import { manifestsFor, type Rulebook } from "../rulebook/rulebook";

export interface ExportProgress {
  readonly phase: "preparing" | "rendering" | "writing" | "manifest" | "done";
  /** 0-based index of the file being written. */
  readonly jobIndex: number;
  readonly jobCount: number;
  readonly jobPath: string;
  readonly jobKind: ExportJobKind | null;
  /** Progress inside the current file, 0…1. */
  readonly jobFraction: number;
  /** Progress of the whole export, 0…1. */
  readonly fraction: number;
  readonly framesWritten: number;
  readonly totalFrames: number;
}

export interface ExportFileResult {
  readonly path: string;
  readonly kind: ExportJobKind;
  readonly output: ExportOutput;
  readonly id: string;
  readonly frames: number;
  readonly seconds: number;
  readonly peakDbfs: number | null;
  readonly clipped: boolean;
  readonly bytes: number;
}

export interface ExportOutcome {
  readonly ok: boolean;
  readonly folder: string;
  readonly destination: string;
  readonly format: ExportFormat;
  readonly files: readonly ExportFileResult[];
  readonly failures: readonly ExportFailure[];
  readonly notes: readonly string[];
  readonly manifest: ExportManifest | null;
  readonly plan: ExportPlan;
  /** Set when the export stopped before writing anything (no selection, no audio, bad destination). */
  readonly stopped: ExportFailure | null;
}

export interface ExportOptions {
  readonly project: Project;
  readonly sources: ReadonlyMap<TrackId, RenderSource>;
  readonly selection: ExportSelection;
  readonly destination: ExportDestination;
  /** The target format; the project's own rate when nothing chooses one (Task 11.1: renders run at the project's rate, then the rate stage converts). */
  readonly format?: ExportFormat;
  /** Task 11.1: dither at the 24-bit depth stage — off by default, TPDF by opt-in. */
  readonly dither?: DitherSetting;
  readonly maskingDynamicBands?: ReadonlyMap<
    TrackId,
    readonly MaskingDynamicBand[]
  >;
  readonly signal?: AbortSignal;
  readonly chunkFrames?: number;
  readonly onProgress?: (progress: ExportProgress) => void;
  /** Awaited between engine blocks; the browser wiring yields to the page. */
  readonly yieldBetween?: () => Promise<void>;
  /** Validation problems from the rulebook set, reported beside the files (Task 8.2 B). */
  readonly rulebooks?: readonly Rulebook[];
}

/** dBFS of a linear peak, or null for digital silence. */
function peakDbfs(peak: number): number | null {
  if (peak <= 0) return null;
  return 20 * Math.log10(peak);
}

/** What every file's audio passes through: the rate stage, then the depth stage (the writer). */
type StageWriter = WavStreamWriter | RateStageWriter;

function reasonOf(error: unknown): ExportFailureReason {
  if (error instanceof RenderCancelledError) return "cancelled";
  if (error instanceof RenderProjectChangedError) return "project-changed";
  const message = error instanceof Error ? error.message : String(error);
  if (/sample rate|Hz|format|stereo, not/i.test(message)) return "format";
  return "write";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The project a stem is rendered from: one track, its own chains and sends, and
 * the Returns those sends reach. Everything else is absent, which is what makes
 * "this track's processing, nothing else" true by construction rather than by
 * subtraction after the fact.
 *
 * Mute and solo are honoured exactly as the mix honours them (a muted track's stem
 * is silent, as it is in the mix): an export must not disagree with what the user
 * hears. Bus destinations stay declared so the engine's routing is the project's.
 */
export function stemProject(project: Project, trackId: TrackId): Project {
  const track = project.tracks.find((entry) => entry.id === trackId);
  if (!track)
    throw new Error(`Alloy export: track ${trackId} is not in this project`);
  const liveSends = new Set(
    track.channel.sends
      .filter((send) => send.to !== null && send.level > -60)
      .map((send) => send.to as string),
  );
  const returns = project.returns.filter((ret) => liveSends.has(ret.id));
  return { ...project, tracks: [track], returns, sidechains: [] };
}

/** The full-mix project with only the bus taps' buses — used for bus-only exports. */
function withBusScope(project: Project): Project {
  return project;
}

export async function exportProject(
  options: ExportOptions,
): Promise<ExportOutcome> {
  // Task 11.1: the render runs at the project's own rate; the target format's
  // rate (a project rate by default) is reached by the rate stage after it.
  const projectRate = options.project.sampleRate;
  const format = options.format ?? {
    ...DEFAULT_EXPORT_FORMAT,
    sampleRate: projectRate,
  };
  const plan = planExport(options.project, options.selection, format);
  const outputs = selectedOutputs(options.selection);
  const base: Omit<
    ExportOutcome,
    "ok" | "files" | "failures" | "manifest" | "stopped"
  > = {
    folder: plan.folder,
    destination: options.destination.print,
    format,
    notes: [
      ...plan.notes,
      ...(format.sampleRate !== projectRate
        ? [
            `${printRateChange(projectRate, format.sampleRate)} — ${CONVERSION_NOTICE}`,
          ]
        : []),
    ],
    plan,
  };

  if (outputs.length === 0) {
    return {
      ...base,
      ok: false,
      files: [],
      failures: [],
      manifest: null,
      stopped: {
        path: plan.folder,
        reason: "no-selection",
        message: NO_SELECTION_MESSAGE,
      },
    };
  }
  if (plan.jobs.length === 0) {
    const message =
      plan.notes.find((note) => note !== NO_SELECTION_MESSAGE) ??
      "There is nothing to export: no track has audio and no bus receives any.";
    return {
      ...base,
      ok: false,
      files: [],
      failures: [],
      manifest: null,
      stopped: { path: plan.folder, reason: "no-audio", message },
    };
  }

  const jobs = plan.jobs;
  const files: ExportFileResult[] = [];
  const failures: ExportFailure[] = [];
  let fatal: ExportFailure | null = null;

  // One high-water mark: the mix pass and the bus files are written by the same
  // render, so their per-file fractions interleave. A progress bar that jumps
  // backwards is a bug, so the reported fraction only ever rises.
  let reported = 0;
  const report = (
    progress: Omit<ExportProgress, "fraction" | "jobCount">,
  ): void => {
    const overall =
      jobs.length === 0
        ? 1
        : (progress.jobIndex + progress.jobFraction) / jobs.length;
    reported = Math.max(reported, Math.max(0, Math.min(1, overall)));
    options.onProgress?.({
      ...progress,
      jobCount: jobs.length,
      fraction: reported,
    });
  };

  // The full mix and the buses come from ONE pass over the whole project, because
  // that pass is the only place where every bus's processed output exists. Doing
  // it once is also what makes a mix and its bus files sample-consistent.
  const mixJob = jobs.find((job) => job.kind === "fullMix") ?? null;
  const busJobs = jobs.filter((job) => job.kind === "bus");
  const stemJobs = jobs.filter((job) => job.kind === "stem");

  // Bus taps: the buses being exported, plus (when the mix is written) nothing extra.
  const busTapIds = busJobs.map((job) => job.id as BusId);
  const mixPassNeeded = mixJob !== null || busTapIds.length > 0;

  if (mixPassNeeded) {
    const jobIndex = mixJob ? jobs.indexOf(mixJob) : jobs.indexOf(busJobs[0]);
    const passLabel = mixJob?.relativePath ?? busJobs[0]?.relativePath ?? "";
    report({
      phase: "preparing",
      jobIndex,
      jobPath: passLabel,
      jobKind: mixJob?.kind ?? "bus",
      jobFraction: 0,
      framesWritten: 0,
      totalFrames: 0,
    });

    // One rate-stage writer per bus file, all fed from the same pass (Task 11.1:
    // the rate stage sits between the render — at the project's rate — and the
    // depth stage, the writer).
    const busWriters = new Map<
      BusId,
      {
        writer: StageWriter;
        job: ExportJob;
        peak: { value: number };
        started: boolean;
      }
    >();
    let mixWriter: StageWriter | null = null;
    let mixPeak = 0;

    try {
      for (const job of busJobs) {
        const sink = await options.destination.createFile(job.relativePath);
        const writer = RateStageWriter.wrap(
          new WavStreamWriter(format, sink, { dither: options.dither }),
          projectRate,
        );
        await writer.begin();
        busWriters.set(job.id as BusId, {
          writer,
          job,
          peak: { value: 0 },
          started: true,
        });
      }
      if (mixJob) {
        const sink = await options.destination.createFile(mixJob.relativePath);
        mixWriter = RateStageWriter.wrap(
          new WavStreamWriter(format, sink, { dither: options.dither }),
          projectRate,
        );
        await mixWriter.begin();
      }
    } catch (error) {
      // The destination refused a file: nothing else can be written either.
      for (const entry of busWriters.values()) await entry.writer.abort(error);
      await mixWriter?.abort(error);
      fatal = {
        path: plan.folder,
        reason: reasonOf(error),
        message: `The export folder could not be written: ${messageOf(error)}`,
      };
    }

    if (!fatal) {
      const pendingBuses = new Set(busTapIds);
      try {
        await renderProject(
          withBusScope(options.project),
          options.sources,
          {
            async write(chunk) {
              const left = chunk.channels[0];
              const frames = chunk.frames;
              report({
                phase: "writing",
                jobIndex,
                jobPath: passLabel,
                jobKind: mixJob?.kind ?? "bus",
                jobFraction: 0,
                framesWritten: chunk.startFrame,
                totalFrames: 0,
              });
              if (mixWriter) {
                mixPeak = Math.max(
                  mixPeak,
                  peakOf([left, chunk.channels[1]], frames),
                );
                await mixWriter.write(left, chunk.channels[1], frames);
              }
            },
          },
          {
            // Task 11.1: the render runs at the project's own rate.
            sampleRate: projectRate,
            chunkFrames: options.chunkFrames,
            maskingDynamicBands: options.maskingDynamicBands,
            signal: options.signal,
            yieldBetween: options.yieldBetween,
            onProgress: (progress) => {
              report({
                phase: "rendering",
                jobIndex,
                jobPath: passLabel,
                jobKind: mixJob?.kind ?? "bus",
                jobFraction: progress.fraction,
                framesWritten: progress.framesWritten,
                totalFrames: progress.totalFrames,
              });
            },
            onBuses:
              busWriters.size > 0
                ? async (tap) => {
                    for (const [id, entry] of busWriters) {
                      if (!pendingBuses.has(id)) continue;
                      const buffer = tap.buses.get(id);
                      if (!buffer) continue;
                      const left = buffer[0].subarray(0, tap.frames);
                      const right = buffer[1].subarray(0, tap.frames);
                      entry.peak.value = Math.max(
                        entry.peak.value,
                        peakOf([left, right], tap.frames),
                      );
                      await entry.writer.write(left, right, tap.frames);
                    }
                  }
                : undefined,
          },
        );
      } catch (error) {
        const reason = reasonOf(error);
        const failure: ExportFailure = {
          path: passLabel || plan.folder,
          reason,
          message: `${reason === "cancelled" ? "The export was cancelled" : reason === "project-changed" ? "The project changed while it was being exported" : "The mix could not be rendered"}: ${messageOf(error)}`,
        };
        failures.push(failure);
        for (const entry of busWriters.values())
          await entry.writer.abort(error);
        await mixWriter?.abort(error);
        if (reason === "format") fatal = failure;
      }

      if (!fatal) {
        // Close the files that were fed. A close failure is that file's failure.
        if (mixJob && mixWriter) {
          try {
            const stats = await mixWriter.finish();
            files.push({
              path: mixJob.relativePath,
              kind: "fullMix",
              output: "fullMix",
              id: mixJob.id,
              frames: stats.frames,
              seconds: stats.frames / format.sampleRate,
              peakDbfs: peakDbfs(mixPeak),
              clipped: stats.clipped,
              bytes: stats.totalBytes,
            });
          } catch (error) {
            failures.push({
              path: mixJob.relativePath,
              reason: "write",
              message: `The full mix could not be written: ${messageOf(error)}`,
            });
          }
        }
        for (const [id, entry] of busWriters) {
          try {
            const stats = await entry.writer.finish();
            files.push({
              path: entry.job.relativePath,
              kind: "bus",
              output: "buses",
              id,
              frames: stats.frames,
              seconds: stats.frames / format.sampleRate,
              peakDbfs: peakDbfs(entry.peak.value),
              clipped: stats.clipped,
              bytes: stats.totalBytes,
            });
          } catch (error) {
            failures.push({
              path: entry.job.relativePath,
              reason: "write",
              message: `The bus file could not be written: ${messageOf(error)}`,
            });
          }
        }
      }
    }
  }

  // Stems: one pass each, from the track-scoped project.
  for (const job of stemJobs) {
    if (options.signal?.aborted) {
      failures.push({
        path: job.relativePath,
        reason: "cancelled",
        message: "The export was cancelled",
      });
      break;
    }
    const jobIndex = jobs.indexOf(job);
    let writer: StageWriter | null = null;
    let peak = 0;
    try {
      const sink = await options.destination.createFile(job.relativePath);
      writer = RateStageWriter.wrap(
        new WavStreamWriter(format, sink, { dither: options.dither }),
        projectRate,
      );
      await writer.begin();
      const project = stemProject(options.project, job.id as TrackId);
      const sources = new Map(
        [...options.sources].filter(([id]) => id === (job.id as TrackId)),
      );
      await renderProject(
        project,
        sources,
        {
          async write(chunk) {
            peak = Math.max(
              peak,
              peakOf([chunk.channels[0], chunk.channels[1]], chunk.frames),
            );
            await writer?.write(
              chunk.channels[0],
              chunk.channels[1],
              chunk.frames,
            );
          },
        },
        {
          // Task 11.1: the render runs at the project's own rate.
          sampleRate: projectRate,
          chunkFrames: options.chunkFrames,
          maskingDynamicBands: undefined,
          signal: options.signal,
          yieldBetween: options.yieldBetween,
          onProgress: (progress) =>
            report({
              phase: "rendering",
              jobIndex,
              jobPath: job.relativePath,
              jobKind: "stem",
              jobFraction: progress.fraction,
              framesWritten: progress.framesWritten,
              totalFrames: progress.totalFrames,
            }),
        },
      );
      const stats = await writer.finish();
      files.push({
        path: job.relativePath,
        kind: "stem",
        output: "stems",
        id: job.id,
        frames: stats.frames,
        seconds: stats.frames / format.sampleRate,
        peakDbfs: peakDbfs(peak),
        clipped: stats.clipped,
        bytes: stats.totalBytes,
      });
    } catch (error) {
      await writer?.abort(error);
      const reason = reasonOf(error);
      failures.push({
        path: job.relativePath,
        reason,
        message: `${job.name}: ${reason === "cancelled" ? "the export was cancelled" : messageOf(error)}`,
      });
      if (reason === "format") {
        fatal = failures[failures.length - 1];
        break;
      }
    }
  }

  // The manifest: the folder explains itself, per plan §12's routing note.
  let manifest: ExportManifest | null = null;
  if (files.length > 0) {
    report({
      phase: "manifest",
      jobIndex: jobs.length,
      jobPath: plan.manifestPath,
      jobKind: null,
      jobFraction: 0,
      framesWritten: 0,
      totalFrames: 0,
    });
    const trackById = new Map(
      options.project.tracks.map((track) => [track.id, track]),
    );
    manifest = buildManifest(
      options.project,
      format,
      outputs,
      files.map((file) => {
        const track =
          file.kind === "stem" ? trackById.get(file.id as TrackId) : undefined;
        return {
          path: file.path,
          output: file.output,
          frames: file.frames,
          seconds: file.seconds,
          peakDbfs: file.peakDbfs,
          clipped: file.clipped,
          ...(track ? { routing: stemRouting(options.project, track) } : {}),
        };
      }),
      failures.map((failure) => `${failure.path}: ${failure.message}`),
    );
    try {
      await options.destination.writeText(
        plan.manifestPath,
        JSON.stringify(manifest, null, 2),
      );
    } catch (error) {
      failures.push({
        path: plan.manifestPath,
        reason: "write",
        message: `The export notes could not be written: ${messageOf(error)}`,
      });
    }
  }

  const ruleNotes = options.rulebooks ? manifestsFor(options.rulebooks) : [];
  report({
    phase: "done",
    jobIndex: jobs.length,
    jobPath: plan.folder,
    jobKind: null,
    jobFraction: 1,
    framesWritten: 0,
    totalFrames: 0,
  });

  return {
    ...base,
    notes: [...base.notes, ...ruleNotes],
    ok: fatal === null && files.length > 0 && failures.length === 0,
    files,
    failures,
    manifest,
    stopped: fatal ?? (files.length === 0 ? (failures[0] ?? null) : null),
  };
}

/** The buses an export would write, for the UI's summary before it starts. */
export function exportableBuses(project: Project) {
  return busesWithSignal(project);
}
