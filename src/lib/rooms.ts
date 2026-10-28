export type RoomId = "console" | "arrange" | "mixer";

export interface RoomDefinition {
  readonly id: RoomId;
  readonly label: string;
  readonly purpose: string;
}

export const ROOMS = [
  {
    id: "console",
    label: "Console",
    purpose: "Primary overview and automatic-mix workspace.",
  },
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
