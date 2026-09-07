export {
  applyMove,
  canEndJumpTurn,
  createInitialState,
  endJumpTurn,
  getAllLegalDestinations,
  getLegalDestinationsForPiece,
  getProgressiveJumpDestinations,
  getResult,
  hasAnyLegalMove,
  hasProgressiveJumpContinuation,
  isLegalMove,
  pieceAt,
  pieceById,
  positionHash,
  remainingRoyals,
  settleJumpSequence,
  square,
  squaresEqual,
  tryApplyMove,
} from "./game";

export {
  applyAiTurn,
  chooseAiMove,
  defaultThinkTimeMs,
  evaluate,
  listAiTurns,
  policyBonus,
  raceMeter,
} from "./ai";

export type { AiDifficulty, AiTurn, ChooseAiMoveOptions } from "./ai";

export type {
  EndReason,
  GameResult,
  GameState,
  GameStatus,
  JumpSequence,
  LegalDestination,
  Move,
  Piece,
  PieceColor,
  PieceKind,
  Side,
  Square,
} from "./types";

export {
  BOARD_SIZE,
  DIRECTIONS,
  isInTargetZone,
  oppositeSide,
  squareKey,
} from "./types";
