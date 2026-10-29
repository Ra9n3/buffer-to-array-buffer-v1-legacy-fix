export type RoomId = "console" | "arrange" | "mixer";

export interface RoomDefinition {
  readonly id: RoomId;
  readonly label: string;
  readonly purpose: string;
}

/**
 * Room navigation order, left to right: Arrange | Console | Mixer.
 *
 * This is an explicit owner instruction for Task 0.5. Product plan §14 lists the
 * rooms as "Console/Arrange/Mixer"; the visible tab order intentionally differs
 * because the owner specified it. The room identities, routes, and purposes are
 * unchanged — only the display order.
 */
export const ROOMS = [
  {
    id: "arrange",
    label: "Arrange",
    purpose: "Import and organize the session.",
  },
  {
    id: "console",
    label: "Console",
    purpose: "Primary overview and automatic-mix workspace.",
  },
  {
    id: "mixer",
    label: "Mixer",
    purpose: "Inspect and edit processing in detail.",
  },
] as const satisfies readonly RoomDefinition[];

export const DEFAULT_ROOM: RoomId = "console";

export function isRoomId(value: string): value is RoomId {
  return ROOMS.some((room) => room.id === value);
}

export function roomHref(id: RoomId): string {
  return `#/${id}`;
}

/* ---------------------------------------------------------------------------
   Private token playground route — Task 1.1.

   Deliberately NOT a room: it is absent from ROOMS, so it can never appear in
   the room navigation, and it has no room label, purpose or tab index. It is a
   review surface for the owner, reachable only by typing the hash.

   The application is hash-routed (a locked Phase 0 decision, so the single-file
   build works on any static host), so `/dev/components` is reached as
   `#/dev/components`. See decisions-log.md.
   --------------------------------------------------------------------------- */
export const DEV_COMPONENTS_PATH = "/dev/components";
export const DEV_COMPONENTS_HREF = `#${DEV_COMPONENTS_PATH}`;

export type AppRoute =
  | { readonly kind: "room"; readonly room: RoomId }
  | { readonly kind: "dev-components" };

export function isDevComponentsHash(hash: string): boolean {
  return hash.replace(/\/+$/, "") === DEV_COMPONENTS_HREF;
}

/**
 * Resolves a location hash to a route. Anything unrecognised falls back to the
 * default room, which preserves the Phase 0 behaviour of landing in the Console.
 */
export function routeFromHash(hash: string): AppRoute {
  if (isDevComponentsHash(hash)) return { kind: "dev-components" };

  return { kind: "room", room: roomFromHash(hash) };
}

export function parseRoomHash(hash: string): RoomId | null {
  const match = /^#\/([^/?#]+)/.exec(hash);
  const candidate = match?.[1];

  return candidate && isRoomId(candidate) ? candidate : null;
}

export function roomFromHash(hash: string): RoomId {
  return parseRoomHash(hash) ?? DEFAULT_ROOM;
}
