import type { GameState } from "@halcontoro/engine";

export type RoomStatus = "waiting" | "playing" | "finished" | "abandoned";

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  guest_id: string | null;
  status: RoomStatus;
  created_at: string;
}

export interface GameRow {
  id: string;
  room_id: string;
  state: GameState;
  version: number;
  updated_at: string;
}

export interface RoomBundle {
  room: RoomRow;
  game: GameRow;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

export function parseGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<GameState>;
  if (!Array.isArray(s.pieces)) return null;
  if (s.turn !== "halcon" && s.turn !== "toro") return null;
  if (s.status !== "playing" && s.status !== "ended") return null;
  if (!s.exitedRoyals || typeof s.exitedRoyals !== "object") return null;
  if (!Array.isArray(s.positionHistory)) return null;
  return s as GameState;
}

export function mapGameRow(row: {
  id: string;
  room_id: string;
  state: unknown;
  version: number;
  updated_at: string;
}): GameRow | null {
  const state = parseGameState(row.state);
  if (!state) return null;
  return {
    id: row.id,
    room_id: row.room_id,
    state,
    version: row.version,
    updated_at: row.updated_at,
  };
}

export function humanizeOnlineError(message: string): string {
  const key = message.replace(/^.*:\s*/, "").trim();
  switch (key) {
    case "not_authenticated":
      return "יש להתחבר לפני משחק אונליין.";
    case "room_not_found":
      return "לא נמצא חדר עם הקוד הזה.";
    case "room_not_joinable":
      return "החדר לא פתוח להצטרפות.";
    case "cannot_join_own_room":
      return "אי אפשר להצטרף לחדר שיצרתם.";
    case "game_missing":
      return "חסר מצב משחק לחדר.";
    case "version_conflict":
      return "היריב כבר שיחק — מרעננים.";
    default:
      if (message === "Failed to fetch") {
        return "לא מצליחים להגיע ל־Supabase. בדקו חיבור והגדרות.";
      }
      return message;
  }
}
