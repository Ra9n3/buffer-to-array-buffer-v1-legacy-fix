<script lang="ts">
  import { settings, settingsOps } from "../lib/settings.svelte";
  import ActionKey from "./ActionKey.svelte";
  import ScreenPanel from "./ScreenPanel.svelte";

  /**
   * The first-run guide — Task 4.1 (D4.1.4).
   *
   * One panel on Home, shown while the guide is pending (never before, never
   * after it was skipped or finished — both are remembered in the stored
   * settings; Settings can bring it back). It is a panel among the others:
   * nothing is covered, nothing waits for it, every room is one click away
   * while it is on screen. Four lines of the essential workflow (plan,
   * "Primary workflow"), stated as this build has them: import, MIX and
   * export arrive with the audio engine.
   */

  const STEPS = [
    { word: "Start", text: "Reopen a recent project or start empty, here on Home. The project you open is the one every room shows." },
    { word: "Import", text: "Bring your stems into Arrange (48 kHz WAV, 24-bit or 32-bit float) and name, prioritise and route them." },
    { word: "Mix", text: "Press MIX in the Console: ALLOY sets levels, EQ, dynamics and sends for the whole session." },
    { word: "Inspect", text: "Open the Mixer to see what changed and turn anything you disagree with — what you touch becomes Manual and stays yours." },
  ] as const;
</script>

{#if settings.showGuide}
  <ScreenPanel title="First time here" id="home-guide-title" note="The essential workflow in four lines. Skip it or finish it; it stays away either way." hook="guide">
    <!-- the steps on a cream card, the approved explanation card's recipe: dark print, no glow -->
    <div class="guide__holder">
      <ol class="guide" data-guide-steps>
        {#each STEPS as step, index (step.word)}
          <li class="guide__step">
            <span class="guide__tag">{index + 1} · {step.word}</span>
            <span class="guide__text">{step.text}</span>
          </li>
        {/each}
      </ol>
    </div>
    <div class="guide__keys" role="group" aria-label="First-run guide">
      <ActionKey label="Skip" name="Skip the first-run guide" hook="guide-skip" onpress={() => settingsOps.skipGuide()} />
      <ActionKey label="Done" name="Finish the first-run guide" hook="guide-done" onpress={() => settingsOps.finishGuide()} />
    </div>
  </ScreenPanel>
{/if}

<style>
  .guide__holder {
    padding: 3px;
    border-radius: 3px;
    background-color: color-mix(in srgb, var(--al-material-recess) 70%, var(--al-material-panel));
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px var(--al-border-strong);
  }

  .guide {
    display: flex;
    flex-direction: column;
    gap: var(--al-space-2xs);
    margin: 0;
    padding: var(--al-space-xs) var(--al-space-sm);
    list-style: none;
    border-radius: 1.5px;
    color: var(--al-text-on-cream);
    background-color: var(--al-material-cream);
    background-image:
      linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0) 40%),
      radial-gradient(120% 90% at 50% 50%, rgba(0, 0, 0, 0) 60%, rgba(90, 70, 30, 0.14) 100%);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
  }

  .guide__step {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: var(--al-space-sm);
    align-items: baseline;
    min-width: 0;
    font-family: var(--al-font-ui);
    font-size: var(--al-text-size-sm);
    line-height: var(--al-line-height-snug);
  }

  .guide__tag {
    font-family: var(--al-font-label);
    font-size: var(--al-text-size-2xs);
    font-weight: var(--al-font-weight-bold);
    letter-spacing: var(--al-letter-spacing-label);
    text-transform: uppercase;
    opacity: 0.7;
  }

  .guide__text {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .guide__keys {
    display: flex;
    gap: var(--al-space-sm);
    padding-top: var(--al-space-2xs);
  }

  @media (max-width: 40rem) {
    .guide__step {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
