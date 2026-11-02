/**
 * The live classification an Arrange track row is BOUND to — Task 3.1.
 *
 * `ArrangeTrackRow` (Task 2.5, approved) prints a track's identity and lets
 * the user set its family, source type and Prominence Tier. Up to Task 2.9
 * those three were the row's own UI state, seeded from the fixture. Task
 * 3.1 lets the room hand the row one object that owns them instead — a view
 * of the shared project store (`trackMeta` in lib/project/store.svelte.ts)
 * — so a family chosen in Arrange is the family the Mixer prints, and a
 * tier chosen here is the tier on the Mixer strip. A caller that passes
 * nothing (the component playground) still gets the row's approved local
 * behaviour.
 *
 * Only the shape — no state, no fixture, no model lives here.
 */
import type { FamilyId, ProminenceTier } from "../lib/arrange";

export interface TrackMetaLive {
  /**
   * Instrument family, or null for none. Setting a family keeps the source
   * type only if it belongs to the new family (the Task 2.5 invariant); the
   * owner of the object enforces it.
   */
  familyId: FamilyId | null;
  /** Source type within the family, or null for Unspecified. */
  sourceTypeId: string | null;
  /**
   * Prominence Tier (plan §5a). Setting it is the user's CHOICE of a tier:
   * it also confirms a suggested tier (owner, Task 3.1).
   */
  tier: ProminenceTier;
  /** False while a suggested tier awaits confirmation. */
  readonly tierConfirmed: boolean;
}
