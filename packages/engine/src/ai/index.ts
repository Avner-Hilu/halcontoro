export {
  evaluate,
  imminentExitBonus,
  nearExitThreat,
  policyBonus,
  progressTowardTarget,
  raceMeter,
} from "./evaluate";
export { chooseAiMove, defaultThinkTimeMs } from "./choose";
export type { AiDifficulty, ChooseAiMoveOptions } from "./choose";
export { applyAiTurn, listAiTurns } from "./turns";
export type { AiTurn } from "./turns";
