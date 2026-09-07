import type { GameState, Piece, PieceColor } from "./types";
import { emptyExited } from "./utils";
import { positionHash } from "./utils";

/**
 * Opening setup (y=0 bottom / Halcon home, y=7 top / Toro home).
 * Colors listed in PRD right-to-left; placed here left-to-right accordingly.
 */
export function createInitialState(): GameState {
  const pieces: Piece[] = [];

  // Halcon royals on y=0, middle files x=2..5, RTL: blue,green,orange,red
  // → LTR: red, orange, green, blue
  const halconRoyalColors: PieceColor[] = [
    "red",
    "orange",
    "green",
    "blue",
  ];
  halconRoyalColors.forEach((color, i) => {
    pieces.push({
      id: `halcon-royal-${color}`,
      side: "halcon",
      kind: "royal",
      color,
      position: { x: 2 + i, y: 0 },
    });
  });

  // Halcon soldiers y=3, RTL: red,orange,green,blue,red,orange,green,blue
  // → LTR x0..7: blue,green,orange,red,blue,green,orange,red
  const halconSoldierColors: PieceColor[] = [
    "blue",
    "green",
    "orange",
    "red",
    "blue",
    "green",
    "orange",
    "red",
  ];
  halconSoldierColors.forEach((color, i) => {
    pieces.push({
      id: `halcon-soldier-${i}-${color}`,
      side: "halcon",
      kind: "soldier",
      color,
      position: { x: i, y: 3 },
    });
  });

  // Toro royals y=7, x=2..5, RTL: red,orange,green,blue → LTR: blue,green,orange,red
  const toroRoyalColors: PieceColor[] = [
    "blue",
    "green",
    "orange",
    "red",
  ];
  toroRoyalColors.forEach((color, i) => {
    pieces.push({
      id: `toro-royal-${color}`,
      side: "toro",
      kind: "royal",
      color,
      position: { x: 2 + i, y: 7 },
    });
  });

  // Toro soldiers y=4, RTL: blue,green,orange,red,... → LTR: red,orange,green,blue,...
  const toroSoldierColors: PieceColor[] = [
    "red",
    "orange",
    "green",
    "blue",
    "red",
    "orange",
    "green",
    "blue",
  ];
  toroSoldierColors.forEach((color, i) => {
    pieces.push({
      id: `toro-soldier-${i}-${color}`,
      side: "toro",
      kind: "soldier",
      color,
      position: { x: i, y: 4 },
    });
  });

  const state: GameState = {
    pieces,
    exitedRoyals: emptyExited(),
    turn: "halcon",
    status: "playing",
    result: null,
    jumpSequence: null,
    positionHistory: [],
  };
  state.positionHistory = [positionHash(state)];
  return state;
}
