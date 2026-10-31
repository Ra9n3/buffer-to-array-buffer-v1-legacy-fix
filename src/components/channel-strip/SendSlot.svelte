<script module lang="ts">
  let nextId = 0;
</script>
<script lang="ts">
  import Knob from "../hardware/Knob.svelte";
  import {
    DEFAULT_SEND_LEVEL,
    EFFECT_RETURNS,
    SEND_RANGE,
    SEND_SLOT_COUNT,
    effectReturn,
    formatSend,
    type ReturnId,
  } from "./track-strip-fixtures";

  /**
   * One configurable send slot of a Console track strip — Task 2.2 (revision).
   *
   * A slot is a scribble window over a green send knob. Unassigned, the window
   * prints SEND and the knob is disabled at OFF. Clicking the window opens a
   * compact menu of the available effect returns (fixture list); choosing one
   * assigns it: the window prints the return's short name and the knob — the
   * approved Knob, green family (spec §5 / plan §8a: sends are green) — holds
   * that return's send level. Clicking the window again lets the user change
   * the assignment or remove it. One slot feeds exactly one return.
   *
   * State lives in the strip (`SlotState`, bound in): UI state only — nothing
   * is routed, mixed or persisted. The knob's own legend prints the slot's
   * identity, "SEND 1" / "SEND 2" (owner, D2.2.9).
   */
  export interface SlotState {
    to: ReturnId | null;
    level: number;
  }

  let {
    index,
    count = SEND_SLOT_COUNT,
    slot = $bindable(),
    /** The return the strip's other slot already feeds; offered greyed. */
    taken = null,
    /** Fixture levels for this track, by return — used when a return is assigned in the UI. */
    fixtureLevels = {},
    trackName,
  }: {
    /** 1-based position in the bay. */
    index: number;
    /** Slots in the bay: the menu spans them all so it never leaves the strip. */
    count?: number;
    slot: SlotState;
    taken?: ReturnId | null;
    fixtureLevels?: Partial<Record<ReturnId, number>>;
    trackName: string;
  } = $props();

  /* The menu spans the whole bay (count slots and the gaps between them),
     starting at the bay's left edge whichever slot opened it. */
  const menuLeft = $derived(`calc(${-(index - 1)} * (100% + var(--al-space-3xs)))`);
  const menuWidth = $derived(`calc(${count} * 100% + ${count - 1} * var(--al-space-3xs))`);

  const uid = `ss${++nextId}`;
  const legend = $derived(`Send ${index}`);

  const assigned = $derived(slot.to ? effectReturn(slot.to) : null);
  const windowText = $derived(assigned ? assigned.short : "SEND");
  const windowName = $derived(
    assigned
      ? `${legend}, ${trackName}: ${assigned.name}. Change or remove the send`
      : `${legend}, ${trackName}: unassigned. Choose a return`,
  );

  let open = $state(false);
  let windowEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();
  let rootEl: HTMLDivElement | undefined = $state();

  function toggle(): void {
    open = !open;
    if (open) queueMicrotask(focusCurrentItem);
  }

  function close(restoreFocus = true): void {
    if (!open) return;
    open = false;
    if (restoreFocus) windowEl?.focus();
  }

  function focusCurrentItem(): void {
    const items = menuItems();
    const current = items.findIndex((el) => el.getAttribute("aria-checked") === "true");
    (items[current >= 0 ? current : 0] ?? items[0])?.focus();
  }

  function menuItems(): HTMLButtonElement[] {
    return menuEl ? Array.from(menuEl.querySelectorAll<HTMLButtonElement>("button:not([disabled])")) : [];
  }

  function assign(returnId: ReturnId): void {
    if (returnId === taken) return;
    if (slot.to !== returnId) {
      // A slot that was off takes the fixture's level for that return (or the
      // default); a slot that already carries a level keeps it — the knob is
      // the level, the window is the destination.
      const keep = slot.to !== null && slot.level > SEND_RANGE.min;
      slot.level = keep ? slot.level : (fixtureLevels[returnId] ?? DEFAULT_SEND_LEVEL);
      slot.to = returnId;
    }
    close();
  }

  function remove(): void {
    slot.to = null;
    slot.level = SEND_RANGE.min;
    close();
  }

  function onMenuKeydown(event: KeyboardEvent): void {
    const items = menuItems();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      toggle();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  /** A press anywhere outside the slot closes the menu. */
  function onDocumentPointerDown(event: PointerEvent): void {
    if (open && rootEl && !rootEl.contains(event.target as Node)) close(false);
  }

  const slotState = $derived(assigned ? "assigned" : "unassigned");
</script>

<svelte:document onpointerdown={onDocumentPointerDown} />

<div
  class="slot"
  class:is-open={open}
  class:is-assigned={assigned !== null}
  role="group"
  aria-label={assigned ? `${legend}, ${assigned.name}` : `${legend}, unassigned`}
  data-send-slot={index}
  data-send-state={slotState}
  data-send-to={slot.to ?? ""}
  bind:this={rootEl}
>
  <!-- the scribble window: the send label the user clicks -->
  <button
    type="button"
    class="slot__window"
    aria-label={windowName}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={`${uid}-menu`}
    title={assigned ? assigned.name : "Choose a return for this send"}
    data-send-label
    onclick={toggle}
    onkeydown={onWindowKeydown}
    bind:this={windowEl}
  >
    <span class="slot__text">{windowText}</span>
    <span class="slot__chevron" aria-hidden="true"></span>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="slot__menu"
      role="menu"
      id={`${uid}-menu`}
      aria-label={`${legend} return`}
      tabindex="-1"
      data-send-menu
      style:left={menuLeft}
      style:width={menuWidth}
      onkeydown={onMenuKeydown}
      bind:this={menuEl}
    >
      {#each EFFECT_RETURNS as ret (ret.id)}
        {@const current = slot.to === ret.id}
        {@const unavailable = ret.id === taken}
        <button
          type="button"
          class="slot__item"
          role="menuitemradio"
          aria-checked={current}
          disabled={unavailable}
          title={unavailable ? `Already fed by the other send slot` : undefined}
          data-send-option={ret.id}
          onclick={() => assign(ret.id)}
        >
          <span class="slot__dot" aria-hidden="true"></span>
          <span class="slot__item-text">{ret.name}</span>
          {#if unavailable}<span class="slot__item-note">used</span>{/if}
        </button>
      {/each}
      {#if assigned}
        <button type="button" class="slot__item slot__item--remove" role="menuitem" data-send-remove onclick={remove}>
          <span class="slot__item-text">Remove send</span>
        </button>
      {/if}
    </div>
  {/if}

  <Knob
    label={legend}
    family="green"
    min={SEND_RANGE.min}
    max={SEND_RANGE.max}
    step={SEND_RANGE.step}
    bind:value={slot.level}
    decimals={0}
    disabled={assigned === null}
    extremes={["OFF", "+6"]}
    format={formatSend}
  />
</div>

<style>
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--al-space-3xs);
    min-width: 0;
  }

  /* --- the scribble window ------------------------------------------------
     The knob's value-window recipe (a dark recess under a 1 px subtle border,
     mono print), made a button: the strip's one place where a destination is
     chosen rather than a value typed. A small chevron says "menu". */
  .slot__window {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--al-space-3xs);
    width: 100%;
    min-width: 0;
    min-height: 1.125rem;
    margin: 0;
    padding: 1px var(--al-space-2xs) 2px;
    border: 1px solid var(--al-border-subtle);
    border-radius: 2px;
    background: var(--al-material-recess);
    color: var(--al-text-muted);
    font-family: var(--al-font-mono);
    font-size: var(--al-text-size-2xs);
    letter-spacing: 0.04em;
    line-height: var(--al-line-height-tight);
    text-transform: uppercase;
    cursor: pointer;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.85),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .slot.is-assigned .slot__window {
    /* an assigned window prints in the function's green family, like a lit legend */
    color: var(--al-function-green-hi);
  }

  .slot__window:hover,
  .slot.is-open .slot__window {
    border-color: var(--al-text-muted);
  }

  .slot__window:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: 1px;
  }

  .slot__text {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot__chevron {
    flex: 0 0 auto;
    width: 0;
    height: 0;
    border-top: 4px solid currentColor;
    border-right: 3px solid transparent;
    border-left: 3px solid transparent;
    opacity: 0.8;
  }

  .slot.is-open .slot__chevron {
    transform: rotate(180deg);
  }

  /* --- the menu -------------------------------------------------------------
     A small raised plate dropped from the window, spanning the sends bay
     (the strip's inner width) so it never leaves the strip — the bank's
     scroller would clip it — and paints above the fader section below. */
  .slot__menu {
    position: absolute;
    top: calc(1.125rem + var(--al-space-3xs));
    z-index: 3;
    display: flex;
    flex-direction: column;
    padding: var(--al-space-3xs);
    border: 1px solid var(--al-border-strong);
    border-radius: 3px;
    background-color: var(--al-material-surface-raised);
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.12));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 6px 14px rgba(0, 0, 0, 0.55),
      0 1px 0 rgba(0, 0, 0, 0.6);
  }

  .slot__item {
    display: flex;
    align-items: center;
    gap: var(--al-space-2xs);
    width: 100%;
    margin: 0;
    padding: var(--al-space-2xs) var(--al-space-2xs);
    border: 0;
    border-radius: 2px;
    background: none;
    color: var(--al-text-primary);
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-tight);
    text-align: left;
    cursor: pointer;
  }

  .slot__item:hover:not(:disabled),
  .slot__item:focus-visible {
    background: rgba(255, 255, 255, 0.07);
    outline: none;
  }

  .slot__item:focus-visible {
    box-shadow: inset 0 0 0 1px var(--al-text-secondary);
  }

  .slot__item:disabled {
    color: var(--al-text-muted);
    cursor: not-allowed;
  }

  .slot__item-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot__item-note {
    flex: 0 0 auto;
    color: var(--al-text-muted);
    font-size: var(--al-text-size-2xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* the selection dot: a tiny green lamp, unlit on the others */
  .slot__dot {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--al-material-recess);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 0, 0, 0.5);
  }

  .slot__item[aria-checked="true"] .slot__dot {
    background: var(--al-function-green-hi);
    box-shadow:
      inset 0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 4px color-mix(in srgb, var(--al-function-green-hi) 70%, transparent);
  }

  .slot__item--remove {
    margin-top: var(--al-space-3xs);
    padding-top: calc(var(--al-space-2xs) + 1px);
    border-top: 1px solid var(--al-bevel-shadow);
    border-radius: 0 0 2px 2px;
    color: var(--al-text-secondary);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045);
  }

  @media (prefers-reduced-motion: no-preference) {
    .slot__chevron {
      transition: transform 120ms ease;
    }
  }
</style>
