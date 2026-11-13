<script lang="ts">
  /**
   * ALLOY — the top menu bar (Task 9.2, restyled in 9.3 per the owner's review).
   *
   * Four standard menus — File, Edit, View, Help — for secondary actions. Owner's
   * review of the first pass: "the menus should be on the left" and the bar must
   * read left-to-right as menus → tool buttons → tab buttons, wearing the same
   * tactile material as the rest of the app. The keys are `ToolbarKey`, the
   * approved cream cap, not grey web buttons.
   *
   * What is real here, and what is honestly absent:
   *
   *   File > Import stems…   opens the same picker the Arrange band used
   *   File > Home            the route the wordmark used to carry
   *   File > Save            forces the pending autosave and reports it
   *   Edit > Undo / Redo     the project history, with its own labels
   *   Help > Settings        Settings moved here from the top bar
   *
   * There is no New/Open/Save-As/Export item: a project is created from Home,
   * reopened from Home, saved automatically, and export has its dialog since
   * Task 11.1 (File > Export…). What does not exist is still documented as
   * absent rather than printed greyed-out.
   */
  import ToolbarKey from "./hardware/ToolbarKey.svelte";
  import { autosave, history } from "../lib/project/store.svelte";

  let {
    onSettings,
    onHome,
    onImport,
    onExport,
  }: {
    onSettings: () => void;
    onHome: () => void;
    onImport: () => void;
    /** Task 11.1: opens the export dialog (File > Export…). */
    onExport: () => void;
  } = $props();

  type MenuId = "file" | "edit" | "view" | "help";

  let openMenu = $state<MenuId | null>(null);
  let bar: HTMLElement | undefined = $state();

  const canUndo = $derived(history.canUndo);
  const canRedo = $derived(history.canRedo);

  function toggle(menu: MenuId): void {
    openMenu = openMenu === menu ? null : menu;
  }

  function run(action: () => void): void {
    openMenu = null;
    action();
  }

  /** Escape closes and returns focus to the key that opened the menu. */
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !openMenu) return;
    const restore = openMenu;
    openMenu = null;
    bar?.querySelector<HTMLButtonElement>(`[data-tkey="${restore}-menu"]`)?.focus();
  }

  /** A press anywhere outside the bar closes the open menu. */
  function onPointerDown(event: PointerEvent): void {
    if (!openMenu) return;
    if (bar?.contains(event.target as Node)) return;
    openMenu = null;
  }

  $effect(() => {
    if (!openMenu) return;
    const win = bar?.ownerDocument?.defaultView;
    if (!win) return;
    win.addEventListener("keydown", onKeydown);
    win.addEventListener("pointerdown", onPointerDown);
    return () => {
      win.removeEventListener("keydown", onKeydown);
      win.removeEventListener("pointerdown", onPointerDown);
    };
  });
</script>

<div class="menubar" data-menubar bind:this={bar}>
  <div class="menubar__item">
    <ToolbarKey label="File" hook="file-menu" active={openMenu === "file"} onpress={() => toggle("file")} />
    {#if openMenu === "file"}
      <ul class="menubar__menu" role="menu" data-menu="file">
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="import"
            onclick={() => run(onImport)}>
            <span>Import stems…</span>
            <span class="menubar__shortcut" aria-hidden="true">Ctrl+I</span>
          </button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="save"
            onclick={() => run(() => void autosave.save())}>
            <span>Save</span>
            <span class="menubar__shortcut" aria-hidden="true">Ctrl+S</span>
          </button>
        </li>
        <!-- Task 11.1: the export dialog. The plan's §12 export now has a UI:
             two selects (depth × rate), the optional TPDF dither, the honest
             project-vs-target print, and the destination folder. -->
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="export"
            onclick={() => run(onExport)}>
            <span>Export…</span>
          </button>
        </li>
        <li role="separator" class="menubar__separator" aria-hidden="true"></li>
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="home"
            onclick={() => run(onHome)}>
            <span>Home</span>
          </button>
        </li>
      </ul>
    {/if}
  </div>

  <div class="menubar__item">
    <ToolbarKey label="Edit" hook="edit-menu" active={openMenu === "edit"} onpress={() => toggle("edit")} />
    {#if openMenu === "edit"}
      <ul class="menubar__menu" role="menu" data-menu="edit">
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="undo"
            disabled={!canUndo} onclick={() => run(() => history.undo())}>
            <span>Undo</span>
            <span class="menubar__shortcut" aria-hidden="true">Ctrl+Z</span>
          </button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="redo"
            disabled={!canRedo} onclick={() => run(() => history.redo())}>
            <span>Redo</span>
            <span class="menubar__shortcut" aria-hidden="true">Ctrl+Shift+Z</span>
          </button>
        </li>
      </ul>
    {/if}
  </div>

  <div class="menubar__item">
    <ToolbarKey label="View" hook="view-menu" active={openMenu === "view"} onpress={() => toggle("view")} />
    {#if openMenu === "view"}
      <ul class="menubar__menu" role="menu" data-menu="view">
        <li role="none"><a role="menuitem" class="menubar__option" href="#/arrange" data-menu-item="view-arrange"><span>Arrange</span></a></li>
        <li role="none"><a role="menuitem" class="menubar__option" href="#/console" data-menu-item="view-console"><span>Console</span></a></li>
        <li role="none"><a role="menuitem" class="menubar__option" href="#/mixer" data-menu-item="view-mixer"><span>Mixer</span></a></li>
        <li role="none"><a role="menuitem" class="menubar__option" href="#/" data-menu-item="view-home"><span>Home</span></a></li>
      </ul>
    {/if}
  </div>

  <div class="menubar__item">
    <ToolbarKey label="Help" hook="help-menu" active={openMenu === "help"} onpress={() => toggle("help")} />
    {#if openMenu === "help"}
      <ul class="menubar__menu" role="menu" data-menu="help">
        <li role="none">
          <button type="button" role="menuitem" class="menubar__option" data-menu-item="settings"
            onclick={() => run(onSettings)}>
            <span>Settings</span>
          </button>
        </li>
      </ul>
    {/if}
  </div>
</div>

<style>
  .menubar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .menubar__item {
    position: relative;
  }

  /* --- the drop-down: a dark plate with engraved options ---------------- */
  .menubar__menu {
    position: absolute;
    top: calc(100% + 0.375rem);
    left: 0;
    z-index: 40;
    min-width: 12rem;
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    background-color: var(--al-material-panel);
    background-image: radial-gradient(
      120% 100% at 18% 0%,
      rgba(255, 255, 255, 0.06) 0%,
      rgba(255, 255, 255, 0.012) 38%,
      rgba(0, 0, 0, 0.25) 100%
    );
    border: 1px solid var(--al-bevel-shadow);
    border-radius: 3px;
    box-shadow:
      inset 0 1px 0 var(--al-bevel-light),
      0 8px 20px rgba(0, 0, 0, 0.55);
  }

  .menubar__option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: 2px;
    background: none;
    color: var(--al-text-primary);
    font-family: var(--al-font-label);
    font-size: 0.75rem;
    line-height: 1.5;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .menubar__option:hover:not(:disabled) {
    background: color-mix(in srgb, var(--al-material-surface-raised) 80%, transparent);
    color: var(--al-text-primary);
  }

  .menubar__option:disabled {
    color: var(--al-text-muted);
    cursor: default;
  }

  .menubar__option:focus-visible {
    outline: 1px solid var(--al-function-amber-hi);
    outline-offset: -1px;
  }

  .menubar__shortcut {
    color: var(--al-text-muted);
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.625rem;
  }

  .menubar__separator {
    height: 1px;
    margin: 0.25rem;
    background: var(--al-bevel-shadow);
  }
</style>
