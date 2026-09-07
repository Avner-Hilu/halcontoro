import {
  chooseAiMove,
  defaultThinkTimeMs,
  type AiDifficulty,
  type AiTurn,
  type GameState,
  type Side,
} from "@halcontoro/engine";

type Request = {
  id: number;
  state: GameState;
  difficulty: AiDifficulty;
  aiSide: Side;
};

type Response = {
  id: number;
  turn: AiTurn | null;
  error?: string;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (t: AiTurn | null) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/ai.worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<Response>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.error) {
        job.reject(new Error(event.data.error));
      } else {
        job.resolve(event.data.turn);
      }
    };
    worker.onerror = () => {
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

/** Ask the AI for a turn (Web Worker when available, main thread fallback). */
export function requestAiTurn(
  state: GameState,
  difficulty: AiDifficulty,
  aiSide: Side,
): Promise<AiTurn | null> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(
      chooseAiMove(state, {
        difficulty,
        aiSide,
        maxTimeMs: defaultThinkTimeMs(difficulty),
      }),
    );
  }

  const id = nextId++;
  const payload: Request = { id, state, difficulty, aiSide };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage(payload);
  });
}
