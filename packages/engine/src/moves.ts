import type {
  GameState,
  LegalDestination,
  Piece,
  Square,
} from "./types";
import {
  DIRECTIONS,
  inBounds,
  squareKey,
  squaresEqual,
} from "./types";
import { occupancyMap, pieceById } from "./utils";

/** Single jump destinations from `from` for a piece of the given color. */
export function getJumpDestinations(
  pieces: Piece[],
  from: Square,
  color: Piece["color"],
): Square[] {
  const occ = occupancyMap(pieces);
  const destinations: Square[] = [];

  for (const dir of DIRECTIONS) {
    const landing = jumpLandingInDirection(occ, from, dir, color);
    if (landing) {
      destinations.push(landing);
    }
  }

  return destinations;
}

function jumpLandingInDirection(
  occ: Map<string, Piece>,
  from: Square,
  dir: Square,
  color: Piece["color"],
): Square | null {
  const first: Square = { x: from.x + dir.x, y: from.y + dir.y };
  if (!inBounds(first)) return null;

  const firstPiece = occ.get(squareKey(first));
  if (!firstPiece || firstPiece.color !== color) return null;

  // Walk continuous same-color group
  let cx = first.x + dir.x;
  let cy = first.y + dir.y;
  while (inBounds({ x: cx, y: cy })) {
    const key = squareKey({ x: cx, y: cy });
    const p = occ.get(key);
    if (!p) {
      // First empty after the group — landing
      return { x: cx, y: cy };
    }
    if (p.color !== color) {
      return null;
    }
    cx += dir.x;
    cy += dir.y;
  }

  // Ran off the board without an empty landing square
  return null;
}

export function getStepDestinations(
  pieces: Piece[],
  from: Square,
): Square[] {
  const occ = occupancyMap(pieces);
  const destinations: Square[] = [];
  for (const dir of DIRECTIONS) {
    const to: Square = { x: from.x + dir.x, y: from.y + dir.y };
    if (inBounds(to) && !occ.has(squareKey(to))) {
      destinations.push(to);
    }
  }
  return destinations;
}

export function getLegalDestinationsForPiece(
  state: GameState,
  piece: Piece,
): LegalDestination[] {
  if (state.status !== "playing") return [];
  if (piece.side !== state.turn) return [];

  if (state.jumpSequence) {
    if (state.jumpSequence.pieceId !== piece.id) return [];
    return getJumpDestinations(state.pieces, piece.position, piece.color).map(
      (to) => ({ to, moveType: "jump" as const }),
    );
  }

  const result: LegalDestination[] = [];

  if (piece.kind === "soldier") {
    for (const to of getStepDestinations(state.pieces, piece.position)) {
      result.push({ to, moveType: "step" });
    }
  }

  for (const to of getJumpDestinations(
    state.pieces,
    piece.position,
    piece.color,
  )) {
    result.push({ to, moveType: "jump" });
  }

  return result;
}

export function getAllLegalDestinations(
  state: GameState,
): Map<string, LegalDestination[]> {
  const map = new Map<string, LegalDestination[]>();
  if (state.status !== "playing") return map;

  if (state.jumpSequence) {
    const piece = pieceById(state.pieces, state.jumpSequence.pieceId);
    if (piece) {
      map.set(piece.id, getLegalDestinationsForPiece(state, piece));
    }
    return map;
  }

  for (const piece of state.pieces) {
    if (piece.side !== state.turn) continue;
    const dests = getLegalDestinationsForPiece(state, piece);
    if (dests.length > 0) {
      map.set(piece.id, dests);
    }
  }
  return map;
}

export function hasAnyLegalMove(state: GameState): boolean {
  return getAllLegalDestinations(state).size > 0;
}

export function findDestination(
  state: GameState,
  pieceId: string,
  to: Square,
): LegalDestination | undefined {
  const piece = pieceById(state.pieces, pieceId);
  if (!piece) return undefined;
  return getLegalDestinationsForPiece(state, piece).find((d) =>
    squaresEqual(d.to, to),
  );
}

/**
 * Further jumps that land on a square not already visited in this turn's path.
 * Revisits are legal by rules but meaningless for the continue/end-turn prompt.
 */
export function getProgressiveJumpDestinations(
  state: GameState,
): LegalDestination[] {
  if (!state.jumpSequence) return [];
  const piece = pieceById(state.pieces, state.jumpSequence.pieceId);
  if (!piece) return [];

  const visited = new Set(
    state.jumpSequence.path.map((s) => squareKey(s)),
  );

  return getLegalDestinationsForPiece(state, piece).filter(
    (d) => d.moveType === "jump" && !visited.has(squareKey(d.to)),
  );
}

export function hasProgressiveJumpContinuation(state: GameState): boolean {
  return getProgressiveJumpDestinations(state).length > 0;
}
