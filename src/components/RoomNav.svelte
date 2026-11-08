<script lang="ts">
  import { HOME_HREF, ROOMS, roomHref, type RoomId } from "../lib/rooms";

  /**
   * The destination tabs (Task 9.2; restyled in 9.3 per the owner's review).
   *
   * null on the private /dev/components playground, where no tab is current.
   * Passing null rather than a defaulted room keeps the dev page from claiming
   * a room it is not.
   *
   * Task 9.3: the tabs are `ToolbarKey`s, so they are the same cream caps as the
   * transport keys and the toolbar. The current tab is not a lamp — these keys
   * have none — its cap is painted dark, which is the console's own reading of an
   * engaged function.
   *
   * The tabs carry no printed index (owner, 9.2): the 01/02/03 prefixes are gone.
   */
  let { room, onHome = false }: {
    room: RoomId | null;
    /** Home is the fourth tab, after the three rooms (owner decision). */
    onHome?: boolean;
  } = $props();
</script>

<nav class="room-nav" aria-label="Rooms">
  <ul>
    {#each ROOMS as item (item.id)}
      <li>
        <!-- A real anchor: the tabs are navigation, and a link must stay a link
             so it can be opened in a new tab and read as a destination. The
             tactile cap is drawn around it by `.nav-key`. -->
        <a
          class="nav-key"
          class:is-active={item.id === room}
          href={roomHref(item.id)}
          aria-current={item.id === room ? "page" : undefined}
          data-nav-key={item.id}
        >
          <span class="nav-key__cap">
            <span class="nav-key__label">{item.label}</span>
          </span>
        </a>
      </li>
    {/each}
    <!--
      Home is the fourth tab, and it is NOT a room and does not become one:
      `RoomId` stays "console" | "arrange" | "mixer", because a room is a
      workspace with a transport-bearing canvas and Home is a screen of recent
      projects. It sits in the same list so there is one row of destinations.
    -->
    <li>
      <a
        class="nav-key"
        class:is-active={onHome}
        href={HOME_HREF}
        aria-current={onHome ? "page" : undefined}
        data-app-link="home"
        data-nav-key="home"
      >
        <span class="nav-key__cap">
          <span class="nav-key__label">Home</span>
        </span>
      </a>
    </li>
  </ul>
</nav>

<style>
  .room-nav {
    min-width: 0;
    max-width: 100%;
  }

  .room-nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /*
    The same cream cap as ToolbarKey, value for value (TactileSwitch variant A),
    written out here because the tab must remain an <a>. Keeping the two recipes
    identical is deliberate: a tab and a toolbar key that differed by a gradient
    stop would read as two materials.
  */
  .nav-key {
    --nk-hi: var(--al-function-cream-hi);
    --nk-base: var(--al-function-cream-base);
    --nk-lo: var(--al-function-cream-lo);
    --nk-dim: color-mix(in srgb, var(--nk-base) 46%, var(--nk-lo));
    --nk-wall: color-mix(in srgb, var(--nk-lo) 70%, black);
    --nk-wall-foot: color-mix(in srgb, var(--nk-lo) 42%, black);
    --nk-ink: var(--al-text-on-cream);
    --nk-lift: 2px;

    display: inline-flex;
    text-decoration: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-key:focus-visible {
    outline: 2px solid var(--al-function-amber-hi);
    outline-offset: 2px;
  }

  .nav-key__cap {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    min-height: 1.375rem;
    padding: 0 0.5625rem;
    border-radius: 4px;
    overflow: hidden;
    background: linear-gradient(
      135deg,
      var(--nk-hi) 0%,
      var(--nk-hi) 10%,
      var(--nk-base) 48%,
      var(--nk-dim) 100%
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 1px 0 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.28),
      inset -1px 0 0 rgba(0, 0, 0, 0.14),
      inset -2px -3px 4px rgba(0, 0, 0, 0.16),
      0 var(--nk-lift) 0 0 var(--nk-wall),
      0 calc(var(--nk-lift) + 1px) 0 0 var(--nk-wall-foot),
      0 calc(var(--nk-lift) + 2px) 3px rgba(0, 0, 0, 0.55);
    transform: translateY(calc(-1 * var(--nk-lift)));
    transition:
      transform 60ms ease-out,
      box-shadow 60ms ease-out;
  }

  .nav-key__cap::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      radial-gradient(
        62% 46% at 30% 20%,
        rgba(255, 255, 255, 0.78) 0%,
        rgba(255, 255, 255, 0.22) 46%,
        rgba(255, 255, 255, 0) 72%
      ),
      radial-gradient(
        50% 30% at 70% 88%,
        rgba(255, 255, 255, 0.14) 0%,
        rgba(255, 255, 255, 0) 70%
      );
    pointer-events: none;
  }

  /* the press: the cap sinks to a 1 px wall */
  .nav-key:active .nav-key__cap {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      inset 1px 0 0 rgba(255, 255, 255, 0.22),
      inset 0 -1px 0 rgba(0, 0, 0, 0.3),
      inset -1px 0 0 rgba(0, 0, 0, 0.16),
      inset 0 2px 3px rgba(0, 0, 0, 0.22),
      0 1px 0 0 var(--nk-wall),
      0 2px 0 0 var(--nk-wall-foot),
      0 2px 2px rgba(0, 0, 0, 0.45);
  }

  .nav-key__label {
    position: relative;
    color: var(--nk-ink);
    font-family: var(--al-font-label);
    font-size: 0.6875rem;
    font-weight: var(--al-font-weight-bold);
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow: 0 0.5px 0 rgba(255, 255, 255, 0.28);
  }

  /* --- current tab: the cap is painted dark --------------------------- */
  .nav-key.is-active .nav-key__cap {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--al-material-surface-raised) 88%, white) 0%,
      var(--al-material-surface-raised) 12%,
      var(--al-material-surface) 52%,
      var(--al-material-recess) 100%
    );
  }

  .nav-key.is-active .nav-key__cap::before {
    opacity: 0.22;
  }

  .nav-key.is-active .nav-key__label {
    color: var(--al-text-primary);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
  }
</style>
