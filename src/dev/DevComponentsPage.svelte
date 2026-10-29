<script lang="ts">
  import { onMount } from "svelte";
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
