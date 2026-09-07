import type { GameState, Piece, PieceColor, Side, Square } from "./types";
import { squareKey } from "./types";

/** Deterministic position key: pieces + exited royals + side to move. */
export function positionHash(state: GameState): string {
  const piecePart = [...state.pieces]
    .map(
      (p) =>
        `${p.id}:${p.side}:${p.kind}:${p.color}:${p.position.x}${p.position.y}`,
    )
    .sort()
    .join("|");

  const exited = (side: Side) =>
    [...state.exitedRoyals[side]].sort().join(",");

  return [
    piecePart,
    `H:${exited("halcon")}`,
    `T:${exited("toro")}`,
    `turn:${state.turn}`,
  ].join(";");
}

export function pieceAt(
  pieces: Piece[],
  sq: Square,
): Piece | undefined {
  return pieces.find(
    (p) => p.position.x === sq.x && p.position.y === sq.y,
  );
}

export function pieceById(
  pieces: Piece[],
  id: string,
): Piece | undefined {
  return pieces.find((p) => p.id === id);
}

export function occupancyMap(pieces: Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    map.set(squareKey(p.position), p);
  }
  return map;
}

export function remainingRoyals(state: GameState, side: Side): number {
  return state.pieces.filter((p) => p.side === side && p.kind === "royal")
    .length;
}

export function cloneState(state: GameState): GameState {
  return {
    pieces: state.pieces.map((p) => ({
      ...p,
      position: { ...p.position },
    })),
    exitedRoyals: {
      halcon: [...state.exitedRoyals.halcon],
      toro: [...state.exitedRoyals.toro],
    },
    turn: state.turn,
    status: state.status,
    result: state.result ? { ...state.result } : null,
    jumpSequence: state.jumpSequence
      ? {
          pieceId: state.jumpSequence.pieceId,
          path: state.jumpSequence.path.map((s) => ({ ...s })),
        }
      : null,
    positionHistory: [...state.positionHistory],
  };
}

export function emptyExited(): Record<Side, PieceColor[]> {
  return { halcon: [], toro: [] };
}
