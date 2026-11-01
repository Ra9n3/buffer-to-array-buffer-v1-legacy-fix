<script module lang="ts">
  /** Unique per-instance id prefix, so the window can name its list. */
  let nextId = 0;

  export interface SelectOption {
    readonly id: string;
    readonly name: string;
  }

  /** "xs": the strips' 18 px value-window; "sm": a 22 px window with 11 px print. */
  export type SelectSize = "xs" | "sm";
</script>

<script lang="ts">
  import { tick } from "svelte";

  /**
   * ALLOY scribble-window select — Task 2.5.
   *
   * The one hardware control that chooses a word rather than a value: a
   * scribble window (the knob's value-window recipe — a dark recess under a
   * 1 px subtle border, mono print in capitals — with a small chevron that
   * says "list") which opens a compact raised plate of options. It is the
   * Task 2.2 send slot's window and menu, lifted out as a shared component
   * with the select-only combobox semantics the plan's "instrument-name
   * combobox" asks for (plan §5a): the window is `role="combobox"`, the plate
   * a `listbox` of `option`s, the current one marked by a lit amber dot
   * (amber = engaged, D1.6 / Task 1.6).
   *
   * Keyboard: Enter / Space / ArrowDown open the list with the current option
   * focused; arrows move (wrapping), Home / End jump, a letter jumps to the
   * next option starting with it, Enter / Space choose, Escape closes and
   * returns focus to the window, Tab leaves. A press anywhere else closes it.
   * The plate drops downward, or upward when the scroller it lives in has
   * more room above than below.
   *
   * State: the chosen id is the caller's (`bind:value`); nothing is stored,
   * routed or persisted here. Colours are tokens only; sizes are rem.
   */
  let {
    options,
    value = $bindable(),
    label,
    context = null,
    size = "xs",
    align = "center",
    title = null,
    disabled = false,
    hook = null,
    onchange = null,
  }: {
    options: readonly SelectOption[];
    /** The chosen option's id. */
    value: string;
    /** What is being chosen — "Instrument", "Prominence tier". Names the control. */
    label: string;
    /** Whose — the track name; joins the accessible name. */
    context?: string | null;
    size?: SelectSize;
    /** How the print sits in the window. */
    align?: "start" | "center";
    /** Tooltip; defaults to "<label>, <context>: <current>". */
    title?: string | null;
    disabled?: boolean;
    /** Value of the root's `data-select` hook; defaults to the label. */
    hook?: string | null;
    onchange?: ((id: string) => void) | null;
  } = $props();

  const uid = `sel${++nextId}`;
  const current = $derived(options.find((o) => o.id === value) ?? null);
  const who = $derived(context ? `${label}, ${context}` : label);
  const currentName = $derived(current?.name ?? "not set");
  const windowName = $derived(`${who}: ${currentName}. Choose`);

  let open = $state(false);
  let dropUp = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let windowEl: HTMLButtonElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  async function openList(): Promise<void> {
    if (disabled || open) return;
    open = true;
    dropUp = false;
    await tick(); // the plate exists
    place();
    await tick(); // and sits where it will stay — only then focus, so focusing cannot scroll the room
    focusCurrent();
  }

  function close(restoreFocus = true): void {
    if (!open) return;
    open = false;
    if (restoreFocus) windowEl?.focus();
  }

  function toggle(): void {
    if (open) close();
    else openList();
  }

  /** The nearest ancestor that scrolls vertically — the room's scroller, or none. */
  function scrollHost(el: HTMLElement): HTMLElement | null {
    let node = el.parentElement;
    while (node) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
      node = node.parentElement;
    }
    return null;
  }

  /** Drop upward when the scroller has more room above the window than below it. */
  function place(): void {
    if (!listEl || !windowEl || !rootEl) return;
    const host = scrollHost(rootEl);
    const bounds = host ? host.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const win = windowEl.getBoundingClientRect();
    const below = bounds.bottom - win.bottom;
    const above = win.top - bounds.top;
    dropUp = listEl.offsetHeight > below && above > below;
  }

  function items(): HTMLElement[] {
    return listEl ? Array.from(listEl.querySelectorAll<HTMLElement>('[role="option"]')) : [];
  }

  function focusCurrent(): void {
    const list = items();
    const i = list.findIndex((el) => el.dataset.selectOption === value);
    (list[i >= 0 ? i : 0] ?? list[0])?.focus();
  }

  function choose(id: string): void {
    if (id !== value) {
      value = id;
      onchange?.(id);
    }
    close();
  }

  function onListKeydown(event: KeyboardEvent): void {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const id = (document.activeElement as HTMLElement | null)?.dataset.selectOption;
      if (id) choose(id);
    } else if (event.key === "Tab") {
      close(false);
    } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // type-ahead: the next option, after the focused one, starting with the letter
      const letter = event.key.toLowerCase();
      const names = options.map((o) => o.name.toLowerCase());
      for (let step = 1; step <= names.length; step += 1) {
        const j = (i + step) % names.length;
        if (names[j].startsWith(letter)) {
          event.preventDefault();
          list[j]?.focus();
          break;
        }
      }
    }
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
      event.preventDefault();
      openList();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  /** A press anywhere outside the control closes the list. */
  function onDocumentPointerDown(event: PointerEvent): void {
    if (open && rootEl && !rootEl.contains(event.target as Node)) close(false);
  }
</script>

<svelte:document onpointerdown={onDocumentPointerDown} />

<div
  class={`select select--${size}`}
  class:is-open={open}
  class:is-up={dropUp}
  class:is-disabled={disabled}
  data-select={hook ?? label}
  data-select-value={value}
  data-select-open={open}
  bind:this={rootEl}
>
  <!-- the scribble window: prints the current choice; press to choose -->
  <button
    type="button"
    class="select__window"
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={`${uid}-list`}
    aria-label={windowName}
    title={title ?? `${who}: ${currentName}`}
    {disabled}
    data-select-window
    style:justify-content={align === "start" ? "flex-start" : "center"}
    onclick={toggle}
    onkeydown={onWindowKeydown}
    bind:this={windowEl}
  >
    <span class="select__text">{current?.name ?? "\u2014"}</span>
    <span class="select__chevron" aria-hidden="true"></span>
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="select__list"
      role="listbox"
      id={`${uid}-list`}
      aria-label={`${who} options`}
      tabindex="-1"
      data-select-list
      onkeydown={onListKeydown}
      bind:this={listEl}
    >
      {#each options as option (option.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="select__option"
          role="option"
          tabindex="-1"
          aria-selected={option.id === value}
          data-select-option={option.id}
          onclick={() => choose(option.id)}
        >
          <span class="select__dot" aria-hidden="true"></span>
          <span class="select__option-text">{option.name}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .select {
    /* the window's height and print, by size */
    --sel-min-height: 1.125rem;
    --sel-type: var(--al-text-size-2xs);

    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .select--sm {
    --sel-min-height: 1.375rem;
    --sel-type: var(--al-text-size-xs);
  }

  /* --- the scribble window (SendSlot.svelte .slot__window, value for value) -- */
  .select__window {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--al-space-3xs);
    width: 100%;
    min-width: 0;
    min-height: var(--sel-min-height);
    margin: 0;
    padding: 1px var(--al-space-2xs) 2px;
    border: 1px solid var(--al-border-subtle);
    border-radius: 2px;
    background: var(--al-material-recess);
    color: var(--al-text-primary);
    font-family: var(--al-font-mono);
    font-size: var(--sel-type);
    letter-spacing: 0.04em;
    line-height: var(--al-line-height-tight);
    text-transform: uppercase;
    cursor: pointer;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.85),
      inset 0 -1px 0 rgba(255, 255, 255, 0.05),
      0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .select__window:hover:not(:disabled),
  .select.is-open .select__window {
    border-color: var(--al-text-muted);
  }

  .select__window:focus-visible {
    outline: 2px solid var(--al-text-secondary);
    outline-offset: 1px;
  }

  .select__window:disabled {
    color: var(--al-text-muted);
    cursor: not-allowed;
  }

  .select__text {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select__chevron {
    flex: 0 0 auto;
    width: 0;
    height: 0;
    border-top: 4px solid currentColor;
    border-right: 3px solid transparent;
    border-left: 3px solid transparent;
    opacity: 0.8;
  }

  .select.is-open .select__chevron {
    transform: rotate(180deg);
  }

  /* --- the list (SendSlot.svelte .slot__menu, value for value) ---------------
     A small raised plate dropped from the window — as wide as the window at
     least, wider if a name needs it — scrolling inside itself past 16rem. */
  .select__list {
    position: absolute;
    top: calc(100% + var(--al-space-3xs));
    left: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    width: max-content;
    min-width: 100%;
    max-width: 16rem;
    max-height: min(16rem, 60vh);
    padding: var(--al-space-3xs);
    border: 1px solid var(--al-border-strong);
    border-radius: 3px;
    background-color: var(--al-material-surface-raised);
    background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.12));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 6px 14px rgba(0, 0, 0, 0.55),
      0 1px 0 rgba(0, 0, 0, 0.6);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--al-material-metal-shadow) var(--al-material-recess);
  }

  .select.is-up .select__list {
    top: auto;
    bottom: calc(100% + var(--al-space-3xs));
  }

  /* --- an option (SendSlot.svelte .slot__item, value for value) ------------- */
  .select__option {
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

  .select__option:hover,
  .select__option:focus-visible {
    background: rgba(255, 255, 255, 0.07);
    outline: none;
  }

  .select__option:focus-visible {
    box-shadow: inset 0 0 0 1px var(--al-text-secondary);
  }

  .select__option-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* the selection dot: a tiny amber lamp, unlit on the others (engaged = amber) */
  .select__dot {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--al-material-recess);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 0, 0, 0.5);
  }

  .select__option[aria-selected="true"] .select__dot {
    background: var(--al-function-amber-hi);
    box-shadow:
      inset 0 0 0 1px rgba(0, 0, 0, 0.35),
      0 0 4px color-mix(in srgb, var(--al-function-amber-hi) 70%, transparent);
  }

  @media (prefers-reduced-motion: no-preference) {
    .select__chevron {
      transition: transform 120ms ease;
    }
  }
</style>
