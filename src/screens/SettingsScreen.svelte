<script lang="ts">
  import EngravedLabel from "../components/hardware/EngravedLabel.svelte";
  import ScribbleSelect from "../components/hardware/ScribbleSelect.svelte";
  import TactileSwitch from "../components/hardware/TactileSwitch.svelte";
  import {
    EXPORT_FORMAT,
    EXPORT_OUTPUTS,
    EXPORT_OUTPUT_PRINT,
    HARDWARE_PROFILES,
    HARDWARE_PROFILE_PRINT,
    settings,
    settingsOps,
    type ExportOutput,
    type HardwareProfile,
    type MotionPreference,
    type TransportPreferences,
    type TransportSwitchKey,
  } from "../lib/settings.svelte";
  import { FOLLOW_MODES, FOLLOW_MODE_PRINT, FOLLOW_TRIGGER_POINTS } from "../lib/playback/follow";
  import ActionKey from "./ActionKey.svelte";
  import Print from "./Print.svelte";
  import ScreenPanel from "./ScreenPanel.svelte";
  import ScreenShell from "./ScreenShell.svelte";

  /**
   * SETTINGS — Task 4.1 (owner, D4.1.3 / D4.1.5 / D4.1.6).
   *
   * Five compact panels of the approved controls over lib/settings.svelte.ts,
   * each saying plainly what its preference does in this build:
   *
   *   Hardware profile   plan §11 — read by the analysis engine (Task 5.2):
   *                      Automatic follows the benchmark measured on this
   *                      computer; a chosen profile overrides it.
   *   Export             plan §12 — WAV only; the output types' default
   *                      selection, stored now, used by the export that
   *                      arrives with rendering.
   *   Accessibility      motion — applied now (lib/preferences.css).
   *   First-run guide    bring it back on Home.
   *   Transport          Task 10.1 — the playhead's Stop and follow
   *                      preferences. Applied now: the transport reads the
   *                      two Stop preferences at every Stop; the Arrange
   *                      playhead and the toolbar's follow group read the
   *                      rest. The follow MODE here is the default every
   *                      panel starts from — each panel keeps its own choice
   *                      on top of it (§13).
   *
   * No visual redesign: the selectors are the scribble windows, the toggles
   * the tactile switches, the print engraved. Keyboard: every control is a
   * real button or listbox; focus is the shell's visible ring.
   */

  const PROFILE_OPTIONS = HARDWARE_PROFILES.map((id) => ({ id, name: HARDWARE_PROFILE_PRINT[id].name }));
  const MOTION_OPTIONS: readonly { readonly id: MotionPreference; readonly name: string }[] = [
    { id: "system", name: "Follow system" },
    { id: "reduced", name: "Reduced" },
  ];
  /** Cap prints for the three output switches (the full names are engraved beside them). */
  const OUTPUT_CAP: Readonly<Record<ExportOutput, string>> = { fullMix: "Mix", stems: "Stems", buses: "Buses" };
  /** Task 10.1: the follow vocabulary and trigger points, as the two selectors print them. */
  const FOLLOW_MODE_OPTIONS = FOLLOW_MODES.map((id) => ({ id, name: FOLLOW_MODE_PRINT[id].name }));
  const FOLLOW_TRIGGER_OPTIONS = FOLLOW_TRIGGER_POINTS.map((p) => ({ id: String(p), name: `${Math.round(p * 100)}%` }));
  const TRANSPORT_SWITCHES: readonly { readonly key: TransportSwitchKey; readonly cap: string; readonly print: string }[] = [
    { key: "returnToStartOnStop", cap: "Start", print: "Return to start on stop" },
    { key: "secondStopReturnsToStart", cap: "2nd", print: "Second stop returns to start" },
    { key: "suspendOnManualScroll", cap: "Hold", print: "Suspend follow on manual scroll" },
    { key: "clickToPlay", cap: "Play", print: "Click the timeline to play" },
    { key: "stationaryWhileRecording", cap: "Fixed", print: "Stationary playhead while recording" },
  ];

  const profileIntent = $derived(HARDWARE_PROFILE_PRINT[settings.hardwareProfile].intent);
  const guideState = $derived(
    settings.onboarding === "pending" ? "Shown on Home until skipped or finished" : settings.onboarding === "skipped" ? "Skipped" : "Finished",
  );
  const storageLine = $derived(
    settings.storage.attached
      ? `Kept in this browser (${settings.storage.storage})${settings.storage.error ? ` — the last write failed: ${settings.storage.error}` : ""}.`
      : "Storage is not available in this browser: these settings last for this visit only.",
  );
</script>

<ScreenShell screenId="settings" title="Settings" purpose="Application preferences. Each panel says whether its setting works in this build or is stored for the audio engine.">
  <div class="settings__grid">
    <ScreenPanel title="Hardware profile" id="settings-profile-title" note="Used by the analysis engine: Automatic follows the benchmark measured on this computer before its first analysis; choosing a profile overrides that measurement." hook="profile">
      <div class="field" data-settings-field="hardware-profile">
        <ScribbleSelect
          label="Hardware profile"
          options={PROFILE_OPTIONS}
          bind:value={() => settings.hardwareProfile, (id) => settingsOps.setHardwareProfile(id as HardwareProfile)}
          size="sm"
          align="start"
          hook="hardware-profile"
        />
        <Print text={profileIntent} tone="muted" />
      </div>
    </ScreenPanel>

    <ScreenPanel title="Export" id="settings-export-title" note="The default selection for the export that arrives with rendering. Nothing is exported in this build; the destination folder is chosen at export time." hook="export">
      <div class="field" data-settings-field="export-format">
        <EngravedLabel text={`Format: ${EXPORT_FORMAT}`} size="xs" />
        <Print text="The one export format of version 1 (plan §12)." tone="muted" />
      </div>
      <div class="outputs" role="group" aria-label="Export output types">
        {#each EXPORT_OUTPUTS as output (output)}
          <div class="output" data-settings-output={output} data-settings-output-on={settings.export[output]}>
            <TactileSwitch
              variant="panel"
              label={OUTPUT_CAP[output]}
              name={`Export ${EXPORT_OUTPUT_PRINT[output].toLowerCase()} by default`}
              lamp="amber"
              bind:engaged={() => settings.export[output], (on) => settingsOps.setExportOutput(output, on)}
            />
            <Print as="span" text={EXPORT_OUTPUT_PRINT[output]} />
          </div>
        {/each}
      </div>
    </ScreenPanel>

    <ScreenPanel title="Accessibility" id="settings-access-title" note="Applied now. Keyboard access and the visible focus ring are always on." hook="accessibility">
      <div class="field" data-settings-field="motion">
        <ScribbleSelect
          label="Motion"
          options={MOTION_OPTIONS}
          bind:value={() => settings.motion, (id) => settingsOps.setMotion(id as MotionPreference)}
          size="sm"
          align="start"
          hook="motion"
        />
        <Print
          text={settings.motion === "reduced"
            ? "Reduced: lamp breathe, meter drift and control transitions are off in ALLOY whatever the system says."
            : "Follow system: ALLOY honours the operating system's reduced-motion preference."}
          tone="muted"
        />
      </div>
    </ScreenPanel>

    <!-- Task 10.1: the transport & playhead preferences — the spec's §14
         list, plus click-to-play (§2's "unless click-to-play is enabled") and
         the §10 stationary-while-recording override. Every control is live:
         the transport reads the two Stop preferences at every Stop, and the
         follow group reads the rest. -->
    <ScreenPanel title="Transport & playhead" id="settings-transport-title" note="The follow mode here is the default every panel starts from; each panel keeps its own choice beside it in the toolbar." hook="transport">
      <div class="field" data-settings-field="follow-mode">
        <ScribbleSelect
          label="Follow mode"
          options={FOLLOW_MODE_OPTIONS}
          bind:value={() => settings.transport.autoScrollMode, (id) => settingsOps.setTransportMode(id as TransportPreferences["autoScrollMode"])}
          size="sm"
          align="start"
          hook="follow-mode"
        />
        <Print text={FOLLOW_MODE_PRINT[settings.transport.autoScrollMode].intent} tone="muted" />
      </div>
      <div class="field" data-settings-field="follow-trigger">
        <ScribbleSelect
          label="Trigger point"
          options={FOLLOW_TRIGGER_OPTIONS}
          bind:value={() => String(settings.transport.autoScrollTriggerPoint), (id) => settingsOps.setTransportTriggerPoint(Number(id))}
          size="sm"
          align="start"
          hook="follow-trigger"
        />
        <Print text="Smooth and stationary follow: the view holds still until the playhead reaches this fraction of the visible timeline, then keeps it there." tone="muted" />
      </div>
      <div class="outputs" role="group" aria-label="Transport and playhead preferences">
        {#each TRANSPORT_SWITCHES as sw (sw.key)}
          <div class="output" data-settings-transport={sw.key} data-settings-transport-on={settings.transport[sw.key]}>
            <TactileSwitch
              variant="panel"
              label={sw.cap}
              name={`${sw.print}: ${settings.transport[sw.key] ? "on" : "off"}`}
              lamp="amber"
              bind:engaged={() => settings.transport[sw.key], (on) => settingsOps.setTransportSwitch(sw.key, on)}
            />
            <Print as="span" text={sw.print} />
          </div>
        {/each}
      </div>
    </ScreenPanel>

    <ScreenPanel title="First-run guide" id="settings-guide-title" hook="guide">
      <div class="guide" data-settings-guide={settings.onboarding}>
        <Print text={guideState} tone="muted" />
        {#if settings.onboarding !== "pending"}
          <ActionKey label="Show again" name="Show the first-run guide again on Home" hook="guide-again" onpress={() => settingsOps.showGuideAgain()} />
        {/if}
      </div>
    </ScreenPanel>
  </div>

  <div class="settings__storage" data-settings-storage={settings.storage.attached ? "attached" : "none"}>
    <Print text={storageLine} tone="muted" />
  </div>
</ScreenShell>

<style>
  .settings__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--al-space-lg);
    align-items: start;
    min-width: 0;
  }

  @media (max-width: 48rem) {
    .settings__grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-xs);
    min-width: 0;
    max-width: 24rem;
  }

  .outputs {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-sm);
  }

  .output {
    --switch-size: 1.75rem;

    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: var(--al-space-sm);
    align-items: center;
    justify-items: center;
    min-width: 0;
  }

  .output > :global([data-screen-print]) {
    justify-self: start;
  }

  .guide {
    display: flex;
    flex-wrap: wrap;
    gap: var(--al-space-md);
    align-items: center;
  }

  .settings__storage {
    min-width: 0;
  }
</style>
