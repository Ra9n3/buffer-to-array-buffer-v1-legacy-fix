export type RoomId = "console" | "arrange" | "mixer";

export interface RoomDefinition {
  readonly id: RoomId;
  readonly label: string;
  readonly purpose: string;
}

/**
 * Navigation order, left to right: Arrange, Mixer, Console.
 *
 * This is an owner decision and it deliberately differs from the product plan's
 * phrasing in §14 ("Console/Arrange/Mixer navigation"). The tab index numbers
 * (01/02/03) follow this array order. The default room is unchanged: see
 * DEFAULT_ROOM below.
 */
export const ROOMS = [
  {
    id: "arrange",
    label: "Arrange",
    purpose: "Import and organize the session.",
  },
  {
    id: "mixer",
    label: "Mixer",
    purpose: "Inspect and edit processing in detail.",
  },
  {
    id: "console",
    label: "Console",
    purpose: "Primary overview and automatic-mix workspace.",
  },
] as const satisfies readonly RoomDefinition[];

/**
 * Default room on load. Left unchanged at Console when the navigation order
 * changed to Arrange/Mixer/Console — reordering the tabs did not request a
 * change of start room, so this is preserved rather than assumed.
 */
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
