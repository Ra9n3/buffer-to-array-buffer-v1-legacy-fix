<script lang="ts">
  import { onMount } from "svelte";
  import KnobFixture, { type KnobFixtureConfig } from "./KnobFixture.svelte";
  import FaderFixture, { type FaderFixtureConfig } from "./FaderFixture.svelte";
  import {
    FUNCTION_ROLE_ORDER,
    TOKENS,
    TOKEN_CATEGORIES,
    functionFamilies,
    readTokenValues,
    tokensInCategory,
    type TokenDef,
  } from "../lib/tokens";

  /**
   * Private token playground — Task 1.1, route #/dev/components.
   *
   * Every value shown on this page is read from the live document at runtime,
   * so it cannot drift from tokens.css. Nothing here hard-codes a colour, a
   * spacing step, or a type size: each specimen renders with `var(--token)`.
   *
   * This page is a review surface, not part of the product UI. It is not
   * reachable from the room navigation and no room links to it.
   */

  let values = $state<Record<string, string>>({});

  /* --- Task 1.2: knob showcase ------------------------------------------
     Fixtures for the playground only. The ranges and units below are chosen to
     exercise the component; they are NOT agreed audio-processing parameters. */

  const KNOB_STATES: KnobFixtureConfig[] = [
    {
      id: "state-default",
      label: "Input trim",
      family: "cream",
      min: 0,
      max: 24,
      step: 0.5,
      value: 6,
      unit: "dB",
      decimals: 1,
      stateNote: "Default",
      meaning: "Idle control at rest.",
    },
    {
      id: "state-dragging",
      label: "EQ 3 kHz",
      family: "amber",
      min: -15,
      max: 15,
      step: 0.5,
      value: 2.5,
      unit: "dB",
      decimals: 1,
      demoState: "dragging",
      stateNote: "Dragging (static demo)",
      meaning:
        "Drag look only: the cap sits deeper under the finger. Real dragging updates the pointer live — try it.",
    },
    {
      id: "state-focused",
      label: "Pan",
      family: "bluegrey",
      min: -50,
      max: 50,
      step: 1,
      value: 0,
      decimals: 0,
      demoState: "focused",
      stateNote: "Keyboard-focused (static demo)",
      meaning:
        "Focus ring drawn statically here. Tab to any knob below to see the real thing.",
    },
    {
      id: "state-disabled",
      label: "Threshold",
      family: "red",
      min: -60,
      max: 0,
      step: 1,
      value: -18,
      unit: "dB",
      decimals: 0,
      disabled: true,
      stateNote: "Disabled",
      meaning: "Desaturated, out of the tab order, and cannot be adjusted.",
    },
    {
      id: "state-editing",
      label: "Send A",
      family: "green",
      min: -60,
      max: 6,
      step: 1,
      value: -8,
      unit: "dB",
      decimals: 0,
      demoState: "editing",
      stateNote: "Numeric entry (static demo)",
      meaning:
        "Double-click any knob, or activate its value, to type a number. Enter commits, Escape cancels.",
    },
  ];

  const KNOB_FAMILIES: KnobFixtureConfig[] = [
    {
      id: "family-cream",
      label: "Input trim",
      family: "cream",
      min: 0,
      max: 24,
      step: 0.5,
      value: 12,
      unit: "dB",
      decimals: 1,
      meaning: "Cream / off-white — input trim and gain staging.",
    },
    {
      id: "family-amber",
      label: "EQ 1 kHz",
      family: "amber",
      min: -15,
      max: 15,
      step: 0.5,
      value: -4.5,
      unit: "dB",
      decimals: 1,
      meaning: "Amber / gold — EQ and tonal controls.",
    },
    {
      id: "family-red",
      label: "Ratio",
      family: "red",
      min: 1,
      max: 20,
      step: 0.5,
      value: 4,
      decimals: 1,
      meaning: "Red — compression and dynamics.",
    },
    {
      id: "family-bluegrey",
      label: "Width",
      family: "bluegrey",
      min: 0,
      max: 200,
      step: 5,
      value: 100,
      unit: "%",
      decimals: 0,
      meaning: "Blue-grey — pan, stereo image and spatial placement.",
    },
    {
      id: "family-green",
      label: "Send B",
      family: "green",
      min: -60,
      max: 6,
      step: 1,
      value: -20,
      unit: "dB",
      decimals: 0,
      meaning: "Green — sends, auxiliary paths, reverb and delay.",
    },
    {
      id: "family-orange",
      label: "Bus master",
      family: "orange",
      min: -60,
      max: 6,
      step: 0.5,
      value: -3,
      unit: "dB",
      decimals: 1,
      meaning: "Orange — bus/group masters, recurring console accent.",
    },
  ];

  /* --- Task 1.3: fader showcase ------------------------------------------
     Fixtures for the playground only. The dB range and the console taper are
     a demonstration law, NOT agreed audio-processing parameters (plan §9
     defers every numeric value; see decisions-log D1.3.1). */

  const FADER_STATES: FaderFixtureConfig[] = [
    {
      id: "fader-state-default",
      label: "Channel",
      value: 0,
      stateNote: "Default",
      meaning: "Idle control at rest, at unity.",
    },
    {
      id: "fader-state-dragging",
      label: "Channel",
      value: -6,
      demoState: "dragging",
      stateNote: "Dragging (static demo)",
      meaning:
        "Drag look only: the cap presses a hair into its carriage and the shadow tightens. Real dragging moves the cap live — try it.",
    },
    {
      id: "fader-state-focused",
      label: "Channel",
      value: 4,
      demoState: "focused",
      stateNote: "Keyboard-focused (static demo)",
      meaning: "Focus ring drawn statically here. Tab to any fader to see the real thing.",
    },
    {
      id: "fader-state-disabled",
      label: "Channel",
      value: -20,
      disabled: true,
      stateNote: "Disabled",
      meaning: "Desaturated, out of the tab order, and cannot be moved.",
    },
    {
      id: "fader-state-editing",
      label: "Channel",
      value: -12,
      demoState: "editing",
      stateNote: "Numeric entry (static demo)",
      meaning:
        "Double-click any fader, or activate its value, to type a number. Enter commits, Escape cancels.",
    },
  ];

  const FADER_POSITIONS: FaderFixtureConfig[] = [
    {
      id: "fader-pos-top",
      label: "Channel",
      value: 10,
      stateNote: "+10 dB — top limit",
      meaning: "The slot stays visible above the cap at full travel.",
    },
    {
      id: "fader-pos-unity",
      label: "Channel",
      value: 0,
      stateNote: "0 dB — unity",
      meaning: "Unity sits at 73% of the travel: the console law.",
    },
    {
      id: "fader-pos-mid",
      label: "Channel",
      value: -30,
      stateNote: "−30 dB",
    },
    {
      id: "fader-pos-bottom",
      label: "Channel",
      value: -60,
      stateNote: "−60 dB — bottom limit",
      meaning: "The slot stays visible below the cap at full travel.",
    },
    {
      id: "fader-pos-send",
      label: "Send A",
      min: -40,
      max: 6,
      step: 1,
      decimals: 0,
      value: -8,
      stateNote: "Narrower range",
      meaning: "−40 … +6 dB through the same law: the print follows the range.",
    },
    {
      id: "fader-pos-linear",
      label: "Blend",
      min: 0,
      max: 100,
      step: 1,
      decimals: 0,
      unit: "%",
      value: 35,
      taper: null,
      majorEvery: 20,
      stateNote: "Linear law",
      meaning: "taper = null: even spacing, a numeral every 20.",
    },
  ];

  const FADER_DETAIL: FaderFixtureConfig = {
    id: "fader-detail",
    label: "Channel",
    value: 0,
    scale: 2.5,
    stateNote: "Cap profile at 2.5×",
    meaning:
      "The same component, enlarged to judge the finger hollow: the back lip's highlight at the top edge, the shadowed upper wall of the hollow, the lower wall climbing back into the light, the front lip's second highlight, and the cap's front wall below it.",
  };

  onMount(() => {
    values = readTokenValues();
  });

  const roleLabel: Record<string, string> = {
    base: "base — cap mid tone",
    hi: "hi — upper-left highlight",
    lo: "lo — lower-right shade",
    ink: "ink — pointer & printed value",
  };

  function valueOf(token: TokenDef): string {
    return values[token.name] ?? "";
  }

  /** Spacing bars are capped so the largest step still fits a card. */
  function barStyle(name: string): string {
    return `inline-size: min(var(${name}), 100%)`;
  }
</script>

<div class="dev-page" data-dev-page>
  <header class="dev-page__head">
    <p class="dev-page__eyebrow">Private review surface — not product UI</p>
    <h1 class="dev-page__title">Design tokens</h1>
    <p class="dev-page__blurb">
      Every token defined in <code>src/lib/tokens.css</code>, shown once each.
      Values below are read from the live document, so what you see is what the
      stylesheet computes. Task 1.1 defines tokens only — the knob, fader,
      switch, meter, engraved-label and lamp components arrive in later tasks.
    </p>
    <p class="dev-page__count" data-token-count>
      {TOKENS.length} tokens in {TOKEN_CATEGORIES.length} categories
    </p>
  </header>

  {#each TOKEN_CATEGORIES as category (category.id)}
    <section
      class="dev-section"
      data-dev-section={category.id}
      aria-labelledby="dev-{category.id}"
    >
      <header class="dev-section__head">
        <h2 class="dev-section__title" id="dev-{category.id}">
          {category.title}
        </h2>
        <p class="dev-section__blurb">{category.blurb}</p>
      </header>

      {#if category.id === "colour-function"}
        <!-- Functional families are grouped rather than listed flat, because the
             meaningful unit is "six families x four cap roles", not 24 loose
             colours. -->
        <div class="dev-families">
          {#each functionFamilies() as family (family.key)}
            <article class="dev-family" data-dev-family={family.key}>
              <h3 class="dev-family__title">{family.label}</h3>
              <p class="dev-family__applies">{family.applies}</p>

              <div
                class="dev-ramp"
                style:background={`linear-gradient(90deg, var(--al-function-${family.key}-lo), var(--al-function-${family.key}-hi))`}
                aria-hidden="true"
              ></div>
              <p class="dev-family__ramp-note">
                lo → hi ramp: the shading range available to a cap dome. Shown to
                judge the gradient; not a component.
              </p>

              <ul class="dev-family__roles">
                {#each FUNCTION_ROLE_ORDER as role (role)}
                  {@const token = family.roles.find((r) => r.role === role)}
                  {#if token}
                    <li class="dev-role">
                      <span
                        class="dev-role__chip"
                        style:background={`var(${token.name})`}
                        aria-hidden="true"
                      ></span>
                      <span class="dev-role__meta">
                        <code class="dev-token__name">{token.name}</code>
                        <span class="dev-role__label">{roleLabel[role]}</span>
                        <span class="dev-token__value" data-token-value={token.name}>
                          {valueOf(token)}
                        </span>
                      </span>
                    </li>
                  {/if}
                {/each}
              </ul>
            </article>
          {/each}
        </div>
      {:else if category.id === "spacing"}
        <ul class="dev-grid">
          {#each tokensInCategory(category.id) as token (token.name)}
            <li class="dev-token dev-token--spacing" data-dev-token={token.name}>
              <span class="dev-spacing__bar" style={barStyle(token.name)}></span>
              <code class="dev-token__name">{token.name}</code>
              <span class="dev-token__row">
                <span class="dev-token__value" data-token-value={token.name}>
                  {valueOf(token)}
                </span>
                <span class="dev-token__usage">{token.usage}</span>
              </span>
            </li>
          {/each}
        </ul>
      {:else if category.id === "typography"}
        <ul class="dev-grid">
          {#each tokensInCategory(category.id) as token (token.name)}
            <li class="dev-token dev-token--type" data-dev-token={token.name}>
              {#if token.name.startsWith("--al-font-") && !token.name.startsWith("--al-font-weight")}
                <p
                  class="dev-type__family"
                  style:font-family={`var(${token.name})`}
                >
                  Engraved label Aa Bb 0123
                </p>
                <p class="dev-type__secondary" style:font-family={`var(${token.name})`}>
                  Primary signal path · the quick brown fox jumps over the lazy dog
                </p>
              {:else if token.name.startsWith("--al-text-size-")}
                <p class="dev-type__size" style:font-size={`var(${token.name})`}>
                  Aa — Input trim 0123
                </p>
                <p class="dev-type__size-sample" style:font-size={`var(${token.name})`}>
                  Reduced energy around 3 kHz to make room for the lead vocal.
                </p>
              {:else if token.name.startsWith("--al-font-weight-")}
                <p class="dev-type__weight" style:font-weight={`var(${token.name})`}>
                  Engraved panel label
                </p>
              {:else if token.name.startsWith("--al-line-height-")}
                <p class="dev-type__leading" style:line-height={`var(${token.name})`}>
                  Two lines of supporting copy, set at this line height, so the
                  leading can be judged directly.
                </p>
              {:else}
                <p
                  class="dev-type__tracking"
                  style:letter-spacing={`var(${token.name})`}
                >
                  INPUT TRIM / EQ / SENDS
                </p>
              {/if}

              <code class="dev-token__name">{token.name}</code>
              <span class="dev-token__row">
                <span class="dev-token__value" data-token-value={token.name}>
                  {valueOf(token)}
                </span>
                <span class="dev-token__usage">{token.usage}</span>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <ul class="dev-grid">
          {#each tokensInCategory(category.id) as token (token.name)}
            <li class="dev-token" data-dev-token={token.name}>
              <span
                class="dev-swatch"
                style:background={`var(${token.name})`}
                aria-hidden="true"
              ></span>
              <code class="dev-token__name">{token.name}</code>
              <span class="dev-token__row">
                <span class="dev-token__value" data-token-value={token.name}>
                  {valueOf(token)}
                </span>
              </span>
              <span class="dev-token__usage">{token.usage}</span>
              <span class="dev-token__source">{token.source}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}

  <!-- ======================================================================
       Component showcase — Task 1.2, the rotary pot.
       Not a token category: this section demonstrates a component that
       consumes the tokens above. It is not skinned into any room.
       ====================================================================== -->
  <section
    class="dev-section"
    data-dev-component="knob"
    aria-labelledby="dev-component-knob"
  >
    <header class="dev-section__head">
      <h2 class="dev-section__title" id="dev-component-knob">
        Component — rotary pot (knob)
      </h2>
      <p class="dev-section__blurb">
        One reusable <code>Knob</code> component, six functional colours, five
        states. The visual foundation is the supplied rotary-knob artwork, kept
        as drawn: a continuous outer body with a lower side wall, a recessed face
        with inset shading, two rings of individually drawn grip ridges, and a
        separate index bar on the face. The whole assembly — body, ridges, face
        and index — rotates together around the centre as the value changes, so
        the knob turns as one piece rather than losing its grip detail. The
        supplied key light is fixed: it belongs to the panel, not the knob. Every
        colour below resolves through the Task 1.1 family tokens — no knob carries
        a hex value of its own.
      </p>
      <p class="dev-section__blurb">
        Interactions are live: drag a knob, Tab to one and use the arrow keys,
        Page Up/Down, Home/End, or double-click it to type a value. Values are
        local to this page and are not connected to any audio or project state.
      </p>
    </header>

    <h3 class="dev-subtitle">Five required states</h3>
    <div class="dev-knobs" data-dev-knob-states>
      {#each KNOB_STATES as config (config.id)}
        <KnobFixture {config} />
      {/each}
    </div>

    <h3 class="dev-subtitle">Six functional colours, side by side</h3>
    <p class="dev-section__blurb">
      The same component, six <code>family</code> values. The colour families and
      their meanings are from plan §4 and hardware spec §5; the body colour is the
      control's identity, not decoration. Paint, lower side wall and both ridge
      rings all derive from one family, so no blue survives into a non-blue knob,
      and the index bar switches to the family ink where white would not read.
    </p>
    <div class="dev-knobs" data-dev-knob-families>
      {#each KNOB_FAMILIES as config (config.id)}
        <KnobFixture {config} />
      {/each}
    </div>
  </section>

  <!-- ======================================================================
       Component showcase — Task 1.3, the vertical fader.
       ====================================================================== -->
  <section
    class="dev-section"
    data-dev-component="fader"
    aria-labelledby="dev-component-fader"
  >
    <header class="dev-section__head">
      <h2 class="dev-section__title" id="dev-component-fader">
        Component — vertical fader
      </h2>
      <p class="dev-section__blurb">
        One reusable <code>Fader</code> component: a cream finger-hollow cap
        riding in a slot recessed into the panel, with the scale printed beside
        it. The cap's top is concave — two raised lips catch the
        panel's top-left light and a hollow pools shadow between them — built as
        one vertical gradient with the light model in its stops, not a flat
        rectangle with a highlight. The print never moves; only the carriage
        does, and only up and down. Every colour resolves through the Task 1.1
        tokens: the cream family for the cap, the material tokens for the
        recess and the print.
      </p>
      <p class="dev-section__blurb">
        Interactions are live: drag a cap, Tab to a fader and use the arrow
        keys, Page Up/Down, Home/End, or double-click it to type a value.
        Values are local to this page and are not connected to any audio or
        project state. The dB scale and its console taper are a demonstration
        law, not agreed audio parameters.
      </p>
    </header>

    <h3 class="dev-subtitle">Five required states</h3>
    <div class="dev-faders" data-dev-fader-states>
      {#each FADER_STATES as config (config.id)}
        <FaderFixture {config} />
      {/each}
    </div>

    <h3 class="dev-subtitle">Positions along the track</h3>
    <p class="dev-section__blurb">
      Both travel limits, unity, a mid position, a narrower range through the
      same law, and the linear law. At either limit the slot remains visible
      beyond the cap: the cap cannot reach the slot's end.
    </p>
    <div class="dev-faders" data-dev-fader-positions>
      {#each FADER_POSITIONS as config (config.id)}
        <FaderFixture {config} />
      {/each}
    </div>

    <h3 class="dev-subtitle">Cap profile, enlarged</h3>
    <div class="dev-faders dev-faders--detail" data-dev-fader-detail>
      <FaderFixture config={FADER_DETAIL} />
    </div>
  </section>
</div>

<style>
  /* The page is deliberately neutral: a mid-grey review sheet so swatches are
     judged against a value that flatters neither light nor dark tokens. */
  .dev-page {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xl);
    min-width: 0;
    padding: var(--al-space-lg);
    background: #cfcfcf;
    color: #1b1b1b;
  }

  .dev-page__head {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
    padding: var(--al-space-md) var(--al-space-lg);
    border: 1px solid #9a9a9a;
    background: #e8e8e8;
  }

  .dev-page__eyebrow {
    margin: 0;
    font-size: var(--al-text-size-xs);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: var(--al-letter-spacing-engraved);
    text-transform: uppercase;
    color: #5d5d5d;
  }

  .dev-page__title {
    margin: 0;
    font-size: var(--al-text-size-2xl);
    line-height: var(--al-line-height-tight);
  }

  .dev-page__blurb {
    max-width: 62ch;
    margin: 0;
    font-size: var(--al-text-size-base);
    line-height: var(--al-line-height-normal);
  }

  .dev-page__blurb code {
    font-family: var(--al-font-mono);
  }

  .dev-page__count {
    margin: 0;
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-sm);
    color: #4d4d4d;
  }

  .dev-section {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-md);
    min-width: 0;
    padding: var(--al-space-md) var(--al-space-lg) var(--al-space-lg);
    border: 1px solid #9a9a9a;
    background: #e8e8e8;
  }

  .dev-section__head {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding-bottom: var(--al-space-sm);
    border-bottom: 1px solid #b5b5b5;
  }

  .dev-section__title {
    margin: 0;
    font-size: var(--al-text-size-xl);
    line-height: var(--al-line-height-tight);
  }

  .dev-section__blurb {
    max-width: 78ch;
    margin: 0;
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  /* auto-fill rather than a fixed column count, so the page stays readable as
     the token count grows: cards reflow instead of the page widening. */
  .dev-grid {
    display: grid;
    /* start, not stretch: cards size to their content, so a short description
       does not leave a card with a band of dead space in a taller row. */
    align-items: start;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: var(--al-space-md);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dev-token {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    min-width: 0;
    padding: var(--al-space-sm);
    border: 1px solid #b5b5b5;
    background: #f4f4f4;
  }

  .dev-swatch {
    display: block;
    block-size: 3.5rem;
    border: 1px solid #6d6d6d;
  }

  .dev-token__name {
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-xs);
    font-weight: var(--al-font-weight-semibold);
    overflow-wrap: anywhere;
  }

  .dev-token__row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--al-space-2xs) var(--al-space-sm);
    min-width: 0;
  }

  .dev-token__value {
    /* Font stacks are long. The chip must wrap rather than clip, so a family
       token's full stack is readable instead of cut off at the card edge. */
    flex: 0 1 auto;
    min-inline-size: 0;
    max-inline-size: 100%;
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-sm);
    color: #1b1b1b;
    background: #e4e4e4;
    padding: 0 var(--al-space-2xs);
    overflow-wrap: anywhere;
  }

  .dev-token__usage {
    flex: 1 1 8rem;
    min-width: 0;
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  .dev-token__source {
    font-size: var(--al-text-size-xs);
    color: #5d5d5d;
  }

  .dev-subtitle {
    margin: var(--al-space-sm) 0 0;
    font-size: var(--al-text-size-base);
    line-height: var(--al-line-height-tight);
  }

  /* Knob grids reflow rather than overflow: as many knobs per row as fit,
     so the page stays usable at 768px and below. */
  .dev-knobs {
    display: grid;
    align-items: start;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: var(--al-space-md);
    min-width: 0;
  }

  .dev-faders {
    display: grid;
    align-items: start;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: var(--al-space-md);
    min-width: 0;
  }

  .dev-faders--detail {
    grid-template-columns: minmax(8.5rem, 20rem);
  }

  /* --- spacing ----------------------------------------------------------- */
  .dev-token--spacing {
    gap: var(--al-space-xs);
  }

  .dev-spacing__bar {
    display: block;
    block-size: 0.75rem;
    background: #4a4a4a;
  }

  /* --- functional families ---------------------------------------------- */
  .dev-families {
    display: grid;
    align-items: start;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: var(--al-space-md);
    min-width: 0;
  }

  .dev-family {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
    padding: var(--al-space-md);
    border: 1px solid #b5b5b5;
    background: #f4f4f4;
  }

  .dev-family__title {
    margin: 0;
    font-size: var(--al-text-size-lg);
    line-height: var(--al-line-height-tight);
  }

  .dev-family__applies {
    margin: 0;
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
  }

  .dev-ramp {
    block-size: 1.25rem;
    border: 1px solid #6d6d6d;
  }

  .dev-family__ramp-note {
    margin: 0;
    font-size: var(--al-text-size-xs);
    line-height: var(--al-line-height-snug);
    color: #5d5d5d;
  }

  .dev-family__roles {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dev-role {
    display: flex;
    align-items: center;
    gap: var(--al-space-sm);
    min-width: 0;
    padding: var(--al-space-2xs);
    border: 1px solid #c4c4c4;
    background: #ededed;
  }

  .dev-role__chip {
    flex: 0 0 auto;
    inline-size: 2rem;
    block-size: 2rem;
    border: 1px solid #6d6d6d;
    border-radius: 50%;
  }

  .dev-role__meta {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
  }

  .dev-role__label {
    font-size: var(--al-text-size-xs);
    color: #4d4d4d;
  }

  /* --- typography ------------------------------------------------------- */
  .dev-token--type {
    gap: var(--al-space-xs);
  }

  .dev-type__family {
    margin: 0;
    font-size: var(--al-text-size-xl);
    line-height: var(--al-line-height-tight);
    overflow-wrap: anywhere;
  }

  .dev-type__secondary {
    margin: 0;
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
    overflow-wrap: anywhere;
  }

  .dev-type__size {
    margin: 0;
    line-height: var(--al-line-height-tight);
  }

  .dev-type__size-sample {
    margin: 0;
    line-height: var(--al-line-height-snug);
    color: #3f3f3f;
    overflow-wrap: anywhere;
  }

  .dev-type__weight {
    margin: 0;
    font-size: var(--al-text-size-base);
    line-height: var(--al-line-height-snug);
  }

  .dev-type__leading {
    margin: 0;
    max-inline-size: 30ch;
    font-size: var(--al-text-size-sm);
    overflow-wrap: anywhere;
  }

  .dev-type__tracking {
    margin: 0;
    font-size: var(--al-text-size-md);
    overflow-wrap: anywhere;
  }
</style>
