<script module lang="ts">
  /** Unique per-instance id prefix for the module headings. */
  let nextId = 0;
</script>
<script lang="ts">
  /**
   * ALLOY Console meter bridge — Task 2.1 (plan §3 "Console room", §14 2.1;
   * hardware spec §4a / §4b / §6).
   *
   * The upper section of the Console: one long bevelled warm-charcoal deck
   * between two walnut end-cheeks, carrying four engraved-outlined modules:
   *
   *   MASTER     the two approved analog VU meters, LEFT and RIGHT, the
   *              largest instruments on the bridge (spec §4a; D1.5.x).
   *   CHANNELS   the same VU meter, smaller, once per channel of the current
   *              bank, each with its compact engraved two-digit identifier;
   *              the row scrolls inside its own module when the bridge is
   *              narrow, never the page.
   *   SPECTRUM   a recessed bay of approved LED ladders, one per band —
   *              the crisp segmented language of spec §4b, visibly not a VU.
   *   GONIOMETER a dark recessed scope with a warm trace and the −1 · 0 · +1
   *              correlation strip (provisional, D2.1.4).
   *
   * Everything on it is fixture data from `bridge-fixtures.ts` — SIMULATED,
   * static, labelled — and nothing is wired to audio, playback, analysis or
   * project state (plan §14: Phases 3, 5 and 8). The deck is a size
   * container: at desktop widths the master meters stand at the right end
   * and the channel row sits above the spectrum and goniometer; narrower,
   * the modules wrap in order of prominence; narrower still, the channel
   * row and the spectrum bay scroll within themselves.
   *
   * Materials: tokens only — the panel, bevel, recess, metal, wood and text
   * tokens, with neutral black/white alphas for light and shade (spec §6:
   * layered gradients, never a flat fill).
   */
  import EngravedLabel from "../hardware/EngravedLabel.svelte";
  import VUMeter from "../hardware/VUMeter.svelte";
  import Goniometer from "./Goniometer.svelte";
  import SpectrumLadder from "./SpectrumLadder.svelte";
  import { BANK_FIXTURE, MASTER_FIXTURE, SIMULATED } from "./bridge-fixtures";

  const uid = `bridge${++nextId}`;
  const bankRange = `${BANK_FIXTURE[0]?.id ?? ""}\u2013${BANK_FIXTURE[BANK_FIXTURE.length - 1]?.id ?? ""}`;
</script>

<div class="bridge" data-meter-bridge data-simulated={SIMULATED}>
  <div class="bridge__cheek bridge__cheek--left" aria-hidden="true"></div>

  <div class="bridge__deck">
    <span class="bridge__screw bridge__screw--tl" aria-hidden="true"></span>
    <span class="bridge__screw bridge__screw--tr" aria-hidden="true"></span>
    <span class="bridge__screw bridge__screw--bl" aria-hidden="true"></span>
    <span class="bridge__screw bridge__screw--br" aria-hidden="true"></span>

    <!-- The zone's heading. ConsoleRoom's meter-bridge <section> is labelled
         by this id; the legend is the bridge's own engraved print. -->
    <header class="bridge__legend">
      <EngravedLabel as="h2" id="console-meter-title" text="Meter bridge" size="sm" />
    </header>

    <div class="bridge__modules">
      <!-- MASTER -->
      <section class="module module--master" aria-labelledby={`${uid}-master`} data-bridge-module="master">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-master`} text="Master" size="xs" />
        </div>
        <div class="master" data-master-meters>
          <div class="master__pair">
            <VUMeter label="Left" level={MASTER_FIXTURE.left} name={`Master left, ${SIMULATED}`} />
            <VUMeter label="Right" level={MASTER_FIXTURE.right} name={`Master right, ${SIMULATED}`} />
          </div>
        </div>
      </section>

      <!-- CHANNELS -->
      <section class="module module--channels" aria-labelledby={`${uid}-channels`} data-bridge-module="channels">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-channels`} text={`Channels ${bankRange}`} size="xs" />
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="channels"
          role="region"
          tabindex="0"
          aria-label={`Channel meters ${bankRange}, ${SIMULATED} readings; scrolls sideways when narrow`}
          data-channel-meters
        >
          <ol class="channels__row" aria-label={`Channels ${bankRange}`}>
            {#each BANK_FIXTURE as channel (channel.id)}
              <li class="channels__meter" data-channel-meter={channel.id}>
                <VUMeter label={channel.id} level={channel.level} name={`Channel ${channel.id}, ${SIMULATED}`} />
              </li>
            {/each}
          </ol>
        </div>
      </section>

      <!-- SPECTRUM -->
      <section class="module module--spectrum" aria-labelledby={`${uid}-spectrum`} data-bridge-module="spectrum">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-spectrum`} text="Spectrum" size="xs" />
        </div>
        <SpectrumLadder />
      </section>

      <!-- GONIOMETER -->
      <section class="module module--stereo" aria-labelledby={`${uid}-stereo`} data-bridge-module="goniometer">
        <div class="module__title">
          <EngravedLabel as="h3" id={`${uid}-stereo`} text="Goniometer" size="xs" />
        </div>
        <Goniometer />
      </section>
    </div>
  </div>

  <div class="bridge__cheek bridge__cheek--right" aria-hidden="true"></div>
</div>

<style>
  /* =======================================================================
     THE HOUSING
     ======================================================================= */
  .bridge {
    /* --- geometry ------------------------------------------------------- */
    --b-cheek: 0.875rem;
    --b-radius: 4px;
    /* --- materials, from the tokens ------------------------------------- */
    --b-wood-light: color-mix(in srgb, var(--al-material-wood) 78%, var(--al-material-metal));
    --b-wood: var(--al-material-wood);
    --b-wood-dark: color-mix(in srgb, var(--al-material-wood) 55%, var(--al-material-recess));
    --b-trim: color-mix(in srgb, var(--al-material-metal) 70%, var(--al-material-cream));

    display: grid;
    grid-template-columns: var(--b-cheek) minmax(0, 1fr) var(--b-cheek);
    min-width: 0;
    width: 100%;
    border-radius: var(--b-radius);
    /* the whole bridge sits a little proud of the room, like a box on the console */
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.35),
      0 8px 18px -10px rgba(0, 0, 0, 0.5);
    user-select: none;
    -webkit-user-select: none;
  }

  /* --- the walnut end-cheeks (plan §4: walnut side trim) ------------------- */
  .bridge__cheek {
    position: relative;
    min-width: 0;
    background-color: var(--b-wood);
    /* a figured grain running top to bottom: fine streaks of lighter and
       darker wood, a broad lift toward the lit top-left, a shadowed foot */
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 30%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.32) 100%),
      repeating-linear-gradient(
        93deg,
        var(--b-wood-light) 0 1px,
        var(--b-wood) 1px 3px,
        var(--b-wood-dark) 3px 4px,
        var(--b-wood) 4px 7px
      );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .bridge__cheek--left {
    border-radius: var(--b-radius) 0 0 var(--b-radius);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.22),
      inset -1px 0 0 rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 rgba(0, 0, 0, 0.55);
  }

  .bridge__cheek--right {
    border-radius: 0 var(--b-radius) var(--b-radius) 0;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      inset 1px 0 0 rgba(255, 255, 255, 0.08),
      inset -1px -1px 0 rgba(0, 0, 0, 0.55);
  }

  /* --- the deck: the approved fixture panel face, as a size container ------ */
  .bridge__deck {
    position: relative;
    container-type: inline-size;
    container-name: bridge;
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-xs) var(--al-space-md) var(--al-space-sm);
    background-color: var(--al-material-panel);
    background-image:
      /* the thin trim line along the top edge, under the bevel */
      linear-gradient(180deg, rgba(0, 0, 0, 0) 1px, var(--b-trim) 1px, var(--b-trim) 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0) 3px),
      radial-gradient(
        120% 100% at 18% 0%,
        rgba(255, 255, 255, 0.07) 0%,
        rgba(255, 255, 255, 0.015) 38%,
        rgba(0, 0, 0, 0.22) 100%
      ),
      repeating-linear-gradient(
        92deg,
        rgba(255, 255, 255, 0.012) 0 1px,
        rgba(0, 0, 0, 0.012) 1px 2px
      );
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      inset 0 -1px 0 var(--al-bevel-shadow),
      inset 1px 0 0 rgba(0, 0, 0, 0.35),
      inset -1px 0 0 rgba(0, 0, 0, 0.35),
      inset 0 12px 18px -14px rgba(0, 0, 0, 0.8);
  }

  /* --- four corner screws: slotted, in the metal tokens ------------------- */
  .bridge__screw {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-image:
      /* the slot */
      linear-gradient(135deg, rgba(0, 0, 0, 0) 44%, rgba(0, 0, 0, 0.7) 44%, rgba(0, 0, 0, 0.7) 56%, rgba(0, 0, 0, 0) 56%),
      /* the domed head, lit top-left */
      radial-gradient(circle at 35% 32%, var(--al-material-metal) 0%, var(--al-material-metal-shadow) 55%, var(--al-bevel-shadow) 100%);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.6),
      0 1px 1px rgba(0, 0, 0, 0.5),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.15);
  }

  .bridge__screw--tl { top: 5px; left: 5px; }
  .bridge__screw--tr { top: 5px; right: 5px; }
  .bridge__screw--bl { bottom: 5px; left: 5px; }
  .bridge__screw--br { bottom: 5px; right: 5px; }

  .bridge__legend {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 var(--al-space-md);
  }

  /* =======================================================================
     THE MODULES
     ======================================================================= */
  .bridge__modules {
    /* Narrow and medium widths: the modules wrap in prominence order —
       master, spectrum, goniometer, channels — each at its own width. */
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--al-space-sm) var(--al-space-md);
    min-width: 0;
  }

  .module {
    position: relative;
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    max-width: 100%;
    padding: var(--al-space-xs) var(--al-space-sm);
    border-radius: 3px;
    /* an engraved outline round the module: a dark line with its lit lower
       wall, the same light as every engraved legend (top-left) */
    box-shadow:
      inset 0 0 0 1px var(--al-bevel-shadow),
      inset 0 1px 0 1px rgba(255, 255, 255, 0.045),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .module--master { order: 1; }
  .module--spectrum { order: 2; }
  .module--stereo { order: 3; }
  .module--channels { order: 4; }

  .module__title {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 0.875rem;
  }

  /* --- master: the two big VUs ------------------------------------------- */
  .master {
    --vu-width: 7.5rem;

    display: flex;
    align-items: flex-start;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 1px;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  /* Auto margins centre the pair and collapse to zero when the pair is wider
     than the module, so the left meter is never scrolled out of reach. */
  .master__pair {
    display: flex;
    flex: 0 0 auto;
    gap: var(--al-space-md);
    align-items: flex-start;
    margin-inline: auto;
  }

  /* --- channels: the bank row, scrolling inside its module --------------- */
  .channels {
    --vu-width: 4.875rem;

    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    padding-bottom: 1px;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  .channels__row {
    display: flex;
    gap: var(--al-space-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .channels__meter {
    flex: 0 0 auto;
    min-width: 0;
  }

  /* =======================================================================
     RESPONSIVE: the deck is the container
     ======================================================================= */

  /* Medium widths: the masters a step larger than the channel meters. */
  @container bridge (min-width: 700px) {
    .master {
      --vu-width: 10rem;
    }
  }

  /* Desktop: a fixed arrangement — channel row over spectrum + goniometer,
     the master pair standing at the right end at full size, and the free
     panel between them left for the transport, status and time displays of
     Task 2.3. */
  @container bridge (min-width: 1150px) {
    .bridge__modules {
      display: grid;
      grid-template-columns: max-content max-content minmax(0, 1fr) max-content;
      grid-template-rows: auto auto;
      grid-template-areas:
        "channels channels . master"
        "spectrum stereo   . master";
      align-items: stretch;
    }

    .module--channels { grid-area: channels; justify-self: start; }
    .module--spectrum { grid-area: spectrum; justify-self: start; }
    .module--stereo { grid-area: stereo; justify-self: start; }
    .module--master {
      grid-area: master;
      justify-self: end;
    }

    /* the pair takes the module's full height and sits centred in it */
    .master {
      --vu-width: 12rem;

      flex: 1 1 auto;
      align-items: center;
    }
  }

  /* Wider decks: the master pair grows in steps while the channel, spectrum
     and goniometer modules keep their fixed sizes. Each threshold is the
     measured left-stack width (683 px) plus the pair, plus ~20 px of slack. */
  @container bridge (min-width: 1180px) {
    .master {
      --vu-width: 13.5rem;
    }
  }

  @container bridge (min-width: 1240px) {
    .master {
      --vu-width: 15rem;
    }
  }

  @container bridge (min-width: 1290px) {
    .master {
      --vu-width: 16.5rem;
    }
  }

  @container bridge (min-width: 1340px) {
    .master {
      --vu-width: 18rem;
    }
  }

  /* Tablet-portrait and below: the goniometer wraps up beside the master pair
     instead of leaving the first row half empty; the spectrum and the channel
     row follow on rows of their own. */
  @container bridge (max-width: 899px) {
    .module--stereo { order: 2; }
    .module--spectrum { order: 3; }
  }

  /* Very narrow: the masters at the playground's 1× so the pair still fits a
     phone-width deck before the row has to scroll. */
  @container bridge (max-width: 420px) {
    .master {
      --vu-width: 7.5rem;
    }

    .master__pair {
      gap: var(--al-space-sm);
    }
  }
</style>
