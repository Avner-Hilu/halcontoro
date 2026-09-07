/** Board coordinates: x = file a–h (0–7), y = rank 1–8 (0–7). Halcon starts on ranks 1–2 side. */

export type Side = "halcon" | "toro";

export type PieceColor = "red" | "orange" | "blue" | "green";

export type PieceKind = "royal" | "soldier";

export interface Square {
  x: number;
  y: number;
}

export interface Piece {
  id: string;
  side: Side;
  kind: PieceKind;
  color: PieceColor;
  position: Square;
}

export type GameStatus = "playing" | "ended";

export type EndReason =
  | "royals_exited"
  | "resign"
  | "no_moves"
  | "threefold"
  | "draw_agreed";

export interface GameResult {
  winner: Side | null;
  reason: EndReason;
}

/** In-progress multi-jump on the current turn. */
export interface JumpSequence {
  pieceId: string;
  path: Square[];
}

export interface GameState {
  pieces: Piece[];
  /** Royals already removed via target zone, by side. */
  exitedRoyals: Record<Side, PieceColor[]>;
  turn: Side;
  status: GameStatus;
  result: GameResult | null;
  jumpSequence: JumpSequence | null;
  /** Position hashes seen (including current), for threefold. */
  positionHistory: string[];
}

export type Move =
  | { type: "step"; pieceId: string; to: Square }
  | { type: "jump"; pieceId: string; to: Square }
  | { type: "resign"; side: Side }
  | { type: "agree_draw" };

export interface LegalDestination {
  to: Square;
  moveType: "step" | "jump";
}

export const BOARD_SIZE = 8;

export const DIRECTIONS: Square[] = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export function oppositeSide(side: Side): Side {
  return side === "halcon" ? "toro" : "halcon";
}

export function squareKey(sq: Square): string {
  return `${sq.x},${sq.y}`;
}

export function squaresEqual(a: Square, b: Square): boolean {
  return a.x === b.x && a.y === b.y;
}

export function inBounds(sq: Square): boolean {
  return sq.x >= 0 && sq.x < BOARD_SIZE && sq.y >= 0 && sq.y < BOARD_SIZE;
}

/** Target zone for a side's royals (opponent's home two ranks). */
export function isInTargetZone(side: Side, sq: Square): boolean {
  if (side === "halcon") {
    return sq.y >= 6;
  }
  return sq.y <= 1;
}
