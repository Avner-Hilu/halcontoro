import { describe, expect, it } from "vitest";
import {
  applyAiTurn,
  chooseAiMove,
  createInitialState,
  evaluate,
  listAiTurns,
  type GameState,
  type Piece,
  type PieceColor,
  type Side,
} from "./index";
import { emptyExited, positionHash } from "./utils";

function makePiece(
  partial: Omit<Piece, "id"> & { id?: string },
): Piece {
  const id =
    partial.id ??
    `${partial.side}-${partial.kind}-${partial.color}-${partial.position.x}${partial.position.y}`;
  return { ...partial, id };
}

function stateWith(
  pieces: Piece[],
  turn: Side = "halcon",
  extras?: Partial<GameState>,
): GameState {
  const state: GameState = {
    pieces,
    exitedRoyals: emptyExited(),
    turn,
    status: "playing",
    result: null,
    jumpSequence: null,
    positionHistory: [],
    ...extras,
  };
  state.positionHistory = [positionHash(state)];
  return state;
}

describe("AI", () => {
  it("lists legal opening turns for Halcon", () => {
    const s = createInitialState();
    const turns = listAiTurns(s);
    expect(turns.length).toBeGreaterThan(10);
    expect(turns.some((t) => t.kind === "step")).toBe(true);
  });

  it("beginner returns a legal turn", () => {
    const s = createInitialState();
    const turn = chooseAiMove(s, { difficulty: "beginner", aiSide: "halcon" });
    expect(turn).not.toBeNull();
    const next = applyAiTurn(s, turn!);
    expect(next.turn).toBe("toro");
  });

  it("intermediate returns a legal turn", () => {
    const s = createInitialState();
    const turn = chooseAiMove(s, {
      difficulty: "intermediate",
      aiSide: "halcon",
      maxTimeMs: 200,
    });
    expect(turn).not.toBeNull();
    const next = applyAiTurn(s, turn!);
    expect(next.status === "playing" || next.status === "ended").toBe(true);
  });

  it("expert takes an available royal exit", () => {
    const royal = makePiece({
      id: "hr",
      side: "halcon",
      kind: "royal",
      color: "red",
      position: { x: 4, y: 5 },
    });
    const bridge = makePiece({
      id: "br",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 4, y: 6 },
    });
    const soldier = makePiece({
      id: "hs",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 0, y: 0 },
    });
    const s = stateWith([royal, bridge, soldier], "halcon");
    const turn = chooseAiMove(s, {
      difficulty: "expert",
      aiSide: "halcon",
      maxTimeMs: 500,
    });
    expect(turn).not.toBeNull();
    expect(turn!.kind).toBe("jumps");
    if (turn!.kind === "jumps") {
      const last = turn!.landings[turn!.landings.length - 1]!;
      expect(last).toEqual({ x: 4, y: 7 });
    }
    const next = applyAiTurn(s, turn!);
    expect(next.exitedRoyals.halcon).toContain("red");
  });

  it("master takes an available royal exit", () => {
    const royal = makePiece({
      id: "hr2",
      side: "halcon",
      kind: "royal",
      color: "red",
      position: { x: 4, y: 5 },
    });
    const bridge = makePiece({
      id: "br2",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 4, y: 6 },
    });
    const soldier = makePiece({
      id: "hs2",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 0, y: 0 },
    });
    const s = stateWith([royal, bridge, soldier], "halcon");
    const turn = chooseAiMove(s, {
      difficulty: "master",
      aiSide: "halcon",
      maxTimeMs: 400,
    });
    expect(turn).not.toBeNull();
    expect(turn!.kind).toBe("jumps");
    if (turn!.kind === "jumps") {
      const last = turn!.landings[turn!.landings.length - 1]!;
      expect(last).toEqual({ x: 4, y: 7 });
    }
  });

  it("master does not gift an opponent exit when a block exists", () => {
    const toroRoyal = makePiece({
      id: "tr",
      side: "toro",
      kind: "royal",
      color: "red",
      position: { x: 4, y: 2 },
    });
    const bridge = makePiece({
      id: "tb",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 4, y: 1 },
    });
    const blocker = makePiece({
      id: "hs",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 3, y: 0 },
    });
    const filler = makePiece({
      id: "hs2",
      side: "halcon",
      kind: "soldier",
      color: "green",
      position: { x: 0, y: 5 },
    });
    const s = stateWith([toroRoyal, bridge, blocker, filler], "halcon");

    const afterUseless = applyAiTurn(s, {
      kind: "step",
      pieceId: "hs2",
      to: { x: 0, y: 6 },
    });
    expect(afterUseless.turn).toBe("toro");
    const toroExit = listAiTurns(afterUseless, "toro").some(
      (t) =>
        t.kind === "jumps" &&
        t.pieceId === "tr" &&
        t.landings.some((l) => l.x === 4 && l.y === 0),
    );
    expect(toroExit).toBe(true);

    const turn = chooseAiMove(s, {
      difficulty: "master",
      aiSide: "halcon",
      maxTimeMs: 1500,
    });
    expect(turn).not.toBeNull();
    const after = applyAiTurn(s, turn!);
    if (after.status === "playing" && after.turn === "toro") {
      const stillExit = listAiTurns(after, "toro").some(
        (t) =>
          t.kind === "jumps" &&
          t.pieceId === "tr" &&
          t.landings.some((l) => l.x === 4 && l.y === 0),
      );
      expect(stillExit).toBe(false);
    }
  });

  it("evaluation prefers having exited a royal", () => {
    const base = createInitialState();
    const ahead: GameState = {
      ...base,
      exitedRoyals: { halcon: ["red" as PieceColor], toro: [] },
      pieces: base.pieces.filter((p) => p.id !== "halcon-royal-red"),
    };
    expect(evaluate(ahead, "halcon")).toBeGreaterThan(evaluate(base, "halcon"));
  });
});
