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

export function parseRoomHash(hash: string): RoomId | null {
  const match = /^#\/([^/?#]+)/.exec(hash);
  const candidate = match?.[1];

  return candidate && isRoomId(candidate) ? candidate : null;
}

export function roomFromHash(hash: string): RoomId {
  return parseRoomHash(hash) ?? DEFAULT_ROOM;
}
