<script lang="ts">
  import TactileSwitch from "../components/hardware/TactileSwitch.svelte";

  /**
   * A momentary key on the Home / Settings screens — Task 4.1.
   *
   * The approved tactile switch in its panel-labelled variant (the function
   * word printed on the panel above a blank cap in its well) used the way
   * the Console transport uses PREVIOUS / NEXT: it springs back the moment
   * it is released, and the press is the action. The lamp stays dark —
   * nothing is "on" after a momentary press. A real button underneath:
   * Space, Enter, focus and the accessible name come from the platform.
   */
  let {
    label,
    name,
    hook,
    onpress,
  }: {
    /** The function word printed on the panel. */
    label: string;
    /** The accessible name (what the action does to what). */
    name: string;
    /** `data-action-key` value for tests and evidence. */
    hook: string;
    onpress: () => void;
  } = $props();

  let on = $state(false);

  function onToggle(): void {
    on = false;
    onpress();
  }
</script>

<span class="key" data-action-key={hook}>
  <TactileSwitch variant="panel" {label} {name} lamp="amber" bind:engaged={on} {onToggle} />
</span>

<style>
  .key {
    --switch-size: 2rem;

    display: inline-flex;
    flex: 0 0 auto;
    /* the panel print is centred over the well and may be wider than it
       (START EMPTY, SHOW AGAIN): room on both sides so the print never runs
       into a neighbour or past the panel's edge */
    padding: 0 2.5rem;
  }
</style>
