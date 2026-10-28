# ALLOY — Product Glossary

Use these definitions consistently across the product specification, task
prompts, implementation, and reports. When older prose uses a near-synonym,
prefer the canonical term below where it fits.

- **Track** — An imported audio stem with its own identity, musical role,
  instrument label, channel controls, processing parameters, and output routing.
- **Organizational Group** — A visual/organizational collection of tracks. It
  supports organization, shared naming, color, and convenience; it does not
  itself sum or process audio.
- **Bus** — An audio-routing destination that sums its input tracks or buses and
  may have its own processing chain. Buses can route to other buses, but
  circular routing is rejected.
- **Return Bus** — A special audio bus intended to receive effect sends, such as
  Reverb Return or Delay Return. It is a visible, selectable channel with its
  own effect-specific processing chain.
- **Role** — A track's musical function, such as lead/main, rhythm,
  stacked/double, or background/harmony.
- **Prominence Tier** — A track's mix-conflict treatment: Primary, Supporting,
  or Background. It is backed by the track's existing 1–10 Priority value.
- **Priority** — The numeric value from 1 to 10 used to express track importance
  in mix conflicts, relative prominence, and related decisions. It is
  independent of Role.
- **Role vs Prominence Tier** — These are unrelated axes despite overlapping
  wording. Role = musical function. Prominence Tier = mix-conflict treatment.
  Never assume one implies the other.
- **Organizational Color** — A curated identity color used to distinguish
  tracks, groups, or buses across Arrange, Mixer, and Console. It is
  independent of functional control colors.
- **Functional Color Coding** — The Section 4 color system used to communicate
  control purpose (for example EQ, dynamics, pan, sends, or bus/group master
  controls). It must not be confused with organizational colors.
- **Auto/Manual** — A per-parameter or per-send mode. Auto values may be
  recalculated by MIX. Manual protects that specific parameter/value from
  recalculation; it does not remove the track from masking resolution or
  automatically disable arrangement-driven movement.
- **Send** — A per-track level feeding a shared Return Bus. Sends are post-fader
  by default in v1.
- **Wet Tail** — The time-extended reverb or delay signal after the dry source
  event; wet tails are included in masking analysis.
- **Rulebook** — External editable JSON data containing genre/instrument-specific
  starting values and behavior. If a rulebook does not specify precedence for an
  interaction, Section 9's deterministic fallback applies.
- **Native Port** — The later Windows implementation using Tauri + Rust, with
  Rust serving as the native application backend and audio engine. No
  JUCE/CMake layer or cross-language audio bridge is part of the target
  architecture.
- **Plugin Hosting** — Deferred third-party plugin support, not part of v1. If
  pursued later, CLAP is preferred first, with VST3 a possible secondary target.
