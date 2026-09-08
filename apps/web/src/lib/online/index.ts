import { createInitialState, type GameState, type Side } from "@halcontoro/engine";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import {
  generateRoomCode,
  mapGameRow,
  type GameRow,
  type RoomBundle,
  type RoomRow,
  type RoomStatus,
} from "./types";

export {
  generateRoomCode,
  humanizeOnlineError,
  parseGameState,
  type GameRow,
  type RoomBundle,
  type RoomRow,
  type RoomStatus,
} from "./types";

function asRoom(row: RoomRow): RoomRow {
  return {
    id: row.id,
    code: row.code,
    host_id: row.host_id,
    guest_id: row.guest_id,
    status: row.status,
    created_at: row.created_at,
  };
}

async function fetchGameForRoom(roomId: string): Promise<GameRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("games")
    .select("id, room_id, state, version, updated_at")
    .eq("room_id", roomId)
    .single();
  if (error) throw new Error(error.message);
  const game = mapGameRow(data);
  if (!game) throw new Error("invalid_game_state");
  return game;
}

export async function createRoom(): Promise<RoomBundle> {
  const supabase = getSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("not_authenticated");

  const initial = createInitialState();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({
        code,
        host_id: user.id,
        status: "waiting",
      })
      .select("id, code, host_id, guest_id, status, created_at")
      .single();

    if (roomError) {
      // Unique code collision — retry.
      if (roomError.code === "23505") {
        lastError = new Error(roomError.message);
        continue;
      }
      throw new Error(roomError.message);
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        room_id: room.id,
        state: initial,
        version: 1,
      })
      .select("id, room_id, state, version, updated_at")
      .single();

    if (gameError) {
      await supabase.from("rooms").delete().eq("id", room.id);
      throw new Error(gameError.message);
    }

    const mapped = mapGameRow(game);
    if (!mapped) {
      await supabase.from("rooms").delete().eq("id", room.id);
      throw new Error("invalid_game_state");
    }

    return { room: asRoom(room as RoomRow), game: mapped };
  }

  throw lastError ?? new Error("could_not_allocate_code");
}

export async function joinRoom(code: string): Promise<RoomBundle> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("join_room", {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw new Error(error.message);

  const payload = data as {
    room: RoomRow;
    game: {
      id: string;
      room_id: string;
      state: unknown;
      version: number;
      updated_at: string;
    };
  };
  if (!payload?.room || !payload?.game) {
    throw new Error("invalid_join_payload");
  }
  const game = mapGameRow(payload.game);
  if (!game) throw new Error("invalid_game_state");
  return { room: asRoom(payload.room), game };
}

export async function fetchRoomBundle(roomId: string): Promise<RoomBundle> {
  const supabase = getSupabase();
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, code, host_id, guest_id, status, created_at")
    .eq("id", roomId)
    .single();
  if (error) throw new Error(error.message);
  const game = await fetchGameForRoom(roomId);
  return { room: asRoom(room as RoomRow), game };
}

export type RoomSubscriptionHandlers = {
  onRoom: (room: RoomRow) => void;
  onGame: (game: GameRow) => void;
  onError?: (message: string) => void;
};

export function subscribeRoom(
  roomId: string,
  gameId: string,
  handlers: RoomSubscriptionHandlers,
): () => void {
  const supabase = getSupabase();
  const channel: RealtimeChannel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as RoomRow | null;
        if (row && payload.new) handlers.onRoom(asRoom(payload.new as RoomRow));
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "games",
        filter: `id=eq.${gameId}`,
      },
      (payload) => {
        const mapped = mapGameRow(payload.new as GameRow);
        if (mapped) handlers.onGame(mapped);
        else handlers.onError?.("invalid_game_state");
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        handlers.onError?.("realtime_channel_error");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function submitGameState(params: {
  gameId: string;
  roomId: string;
  expectedVersion: number;
  nextState: GameState;
  roomStatus?: RoomStatus;
}): Promise<GameRow> {
  const supabase = getSupabase();
  const nextVersion = params.expectedVersion + 1;
  const { data, error } = await supabase
    .from("games")
    .update({
      state: params.nextState,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.gameId)
    .eq("version", params.expectedVersion)
    .select("id, room_id, state, version, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("version_conflict");

  if (params.roomStatus) {
    const { error: roomError } = await supabase
      .from("rooms")
      .update({ status: params.roomStatus })
      .eq("id", params.roomId);
    if (roomError) throw new Error(roomError.message);
  }

  const mapped = mapGameRow(data);
  if (!mapped) throw new Error("invalid_game_state");
  return mapped;
}

export async function abandonRoom(roomId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("rooms")
    .update({ status: "abandoned" })
    .eq("id", roomId);
  if (error) throw new Error(error.message);
}

export function mySideForRoom(room: RoomRow, userId: string): Side | null {
  if (room.host_id === userId) return "halcon";
  if (room.guest_id === userId) return "toro";
  return null;
}
