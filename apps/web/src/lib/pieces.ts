import type { Piece, PieceColor, PieceKind, Side } from "@halcontoro/engine";

/** Map piece to public asset path (new royal/soldier art pack). */
export function pieceImageSrc(piece: Piece): string {
  return `/assets/images/${piece.side}_${piece.kind}_${piece.color}.png`;
}

export function sideLabel(side: Side): string {
  return side === "halcon" ? "Halcon" : "Toro";
}

export function kindLabel(kind: PieceKind): string {
  return kind === "royal" ? "מלכותי" : "חייל";
}

/** Accessibility marks — art already encodes color; kept for non-image contexts. */
export const RUNE: Record<PieceColor, string> = {
  red: "◆",
  orange: "▲",
  blue: "▼",
  green: "✦",
};
