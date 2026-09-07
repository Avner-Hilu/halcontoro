/// <reference lib="webworker" />

import {
  chooseAiMove,
  defaultThinkTimeMs,
  type AiDifficulty,
  type AiTurn,
  type GameState,
  type Side,
} from "@halcontoro/engine";

export type AiWorkerRequest = {
  id: number;
  state: GameState;
  difficulty: AiDifficulty;
  aiSide: Side;
};

export type AiWorkerResponse = {
  id: number;
  turn: AiTurn | null;
  error?: string;
};

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { id, state, difficulty, aiSide } = event.data;
  try {
    const turn = chooseAiMove(state, {
      difficulty,
      aiSide,
      maxTimeMs: defaultThinkTimeMs(difficulty),
    });
    const response: AiWorkerResponse = { id, turn };
    self.postMessage(response);
  } catch (e) {
    const response: AiWorkerResponse = {
      id,
      turn: null,
      error: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(response);
  }
};
