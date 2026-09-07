import type { GameState, Side, Square } from "../types";
import { isInTargetZone } from "../types";
import { applyMove, endJumpTurn } from "../game";
import {
  getAllLegalDestinations,
  getProgressiveJumpDestinations,
  hasProgressiveJumpContinuation,
} from "../moves";
import { cloneState, pieceById } from "../utils";
import {
  evaluate,
  isForwardFor,
  progressTowardTarget,
} from "./evaluate";

/** A complete turn the AI can play (step or one-or-more jumps). */
export type AiTurn =
  | { kind: "step"; pieceId: string; to: Square }
  | { kind: "jumps"; pieceId: string; landings: Square[] };

export interface ListAiTurnsOptions {
  /** Explore multiple multi-jump paths (master). */
  richPaths?: boolean;
}

/**
 * Compact move list:
 * - all soldier steps
 * - royal/soldier jumps that don't retreat (royals: no net backward)
 * - greedy (or beam) forward-extending multi-jumps
 */
export function listAiTurns(
  state: GameState,
  aiSide?: Side,
  options?: ListAiTurnsOptions,
): AiTurn[] {
  if (state.status !== "playing") return [];
  const perspective = aiSide ?? state.turn;
  const rich = options?.richPaths === true;

  if (state.jumpSequence) {
    return progressiveTurns(state, perspective, rich);
  }

  const turns: AiTurn[] = [];
  const all = getAllLegalDestinations(state);

  for (const [pieceId, dests] of all) {
    const piece = pieceById(state.pieces, pieceId);
    if (!piece) continue;

    for (const d of dests) {
      if (d.moveType === "step") {
        turns.push({ kind: "step", pieceId, to: d.to });
        continue;
      }

      if (piece.kind === "royal" && isRetreat(piece.side, piece.position, d.to)) {
        continue;
      }

      turns.push({ kind: "jumps", pieceId, landings: [d.to] });

      if (rich && piece.kind === "royal") {
        for (const path of beamExtend(state, pieceId, [d.to], perspective, 3)) {
          if (path.length > 1 && !samePath(path, [d.to])) {
            const end = path[path.length - 1]!;
            if (
              isInTargetZone(piece.side, end) ||
              progressTowardTarget({ ...piece, position: end }) >=
                progressTowardTarget(piece)
            ) {
              turns.push({ kind: "jumps", pieceId, landings: path });
            }
          }
        }
      } else {
        const extended = greedyExtend(state, pieceId, [d.to], perspective);
        if (extended.length > 1 && !samePath(extended, [d.to])) {
          if (piece.kind === "royal") {
            const end = extended[extended.length - 1]!;
            if (
              isInTargetZone(piece.side, end) ||
              progressTowardTarget({ ...piece, position: end }) >=
                progressTowardTarget(piece)
            ) {
              turns.push({ kind: "jumps", pieceId, landings: extended });
            }
          } else {
            turns.push({ kind: "jumps", pieceId, landings: extended });
          }
        }
      }
    }
  }

  for (const [pieceId, dests] of all) {
    const piece = pieceById(state.pieces, pieceId);
    if (!piece || piece.kind !== "royal") continue;
    const hasUseful = turns.some((t) => t.pieceId === pieceId);
    if (hasUseful) continue;
    const jumps = dests.filter((d) => d.moveType === "jump");
    if (jumps.length === 0) continue;
    jumps.sort((a, b) => {
      const pa = progressTowardTarget({ ...piece, position: a.to });
      const pb = progressTowardTarget({ ...piece, position: b.to });
      return pb - pa;
    });
    turns.push({ kind: "jumps", pieceId, landings: [jumps[0]!.to] });
  }

  return dedupeTurns(turns);
}

function progressiveTurns(
  state: GameState,
  perspective: Side,
  rich: boolean,
): AiTurn[] {
  const pieceId = state.jumpSequence!.pieceId;
  const piece = pieceById(state.pieces, pieceId);
  const progressive = getProgressiveJumpDestinations(state);
  const turns: AiTurn[] = [];

  for (const d of progressive) {
    if (
      piece?.kind === "royal" &&
      isRetreat(piece.side, piece.position, d.to) &&
      !isInTargetZone(piece.side, d.to)
    ) {
      continue;
    }
    turns.push({ kind: "jumps", pieceId, landings: [d.to] });
  }

  if (turns.length === 0) {
    for (const d of progressive) {
      turns.push({ kind: "jumps", pieceId, landings: [d.to] });
    }
  }

  for (const d of progressive) {
    if (rich && piece?.kind === "royal") {
      for (const path of beamExtend(state, pieceId, [d.to], perspective, 3)) {
        if (path.length > 1) turns.push({ kind: "jumps", pieceId, landings: path });
      }
    } else {
      const ext = greedyExtend(state, pieceId, [d.to], perspective);
      if (ext.length > 1) {
        turns.push({ kind: "jumps", pieceId, landings: ext });
      }
    }
  }

  return dedupeTurns(turns);
}

function isRetreat(side: Side, from: Square, to: Square): boolean {
  return progressTowardTarget({
    id: "",
    side,
    kind: "royal",
    color: "red",
    position: to,
  }) <
    progressTowardTarget({
      id: "",
      side,
      kind: "royal",
      color: "red",
      position: from,
    });
}

function samePath(a: Square[], b: Square[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.x === b[i]!.x && s.y === b[i]!.y);
}

function greedyExtend(
  root: GameState,
  pieceId: string,
  landings: Square[],
  perspective: Side,
): Square[] {
  const paths = beamExtend(root, pieceId, landings, perspective, 1);
  return paths[0] ?? landings;
}

/** Beam-search multi-jump continuations; returns up to `beam` paths. */
function beamExtend(
  root: GameState,
  pieceId: string,
  landings: Square[],
  perspective: Side,
  beam: number,
): Square[][] {
  type Node = { path: Square[]; state: GameState; score: number };
  let frontier: Node[] = [];

  let s0 = cloneState(root);
  for (const to of landings) {
    s0 = applyMove(s0, { type: "jump", pieceId, to });
    if (s0.status !== "playing" || !s0.jumpSequence) {
      return [landings];
    }
  }

  const piece0 = pieceById(root.pieces, pieceId);
  frontier.push({
    path: [...landings],
    state: s0,
    score: pathScore(root, piece0, landings, perspective, s0),
  });

  const completed: Node[] = [];

  for (let guard = 0; guard < 5; guard++) {
    const nextFrontier: Node[] = [];
    for (const node of frontier) {
      if (!hasProgressiveJumpContinuation(node.state)) {
        completed.push(node);
        continue;
      }
      let options = getProgressiveJumpDestinations(node.state);
      if (options.length === 0) {
        completed.push(node);
        continue;
      }

      const piece = pieceById(node.state.pieces, pieceId);
      if (piece?.kind === "royal") {
        const forwardish = options.filter(
          (o) =>
            isInTargetZone(piece.side, o.to) ||
            isForwardFor(piece.side, piece.position, o.to) ||
            progressTowardTarget({ ...piece, position: o.to }) >=
              progressTowardTarget(piece),
        );
        if (forwardish.length > 0) options = forwardish;
      }

      for (const opt of options) {
        if (
          piece0?.kind === "royal" &&
          piece &&
          isRetreat(piece.side, piece.position, opt.to) &&
          !isInTargetZone(piece.side, opt.to)
        ) {
          continue;
        }
        const nextState = applyMove(node.state, {
          type: "jump",
          pieceId,
          to: opt.to,
        });
        const path = [...node.path, opt.to];
        const score = pathScore(root, piece0, path, perspective, nextState);
        nextFrontier.push({ path, state: nextState, score });
      }

      // Also allow stopping here.
      completed.push(node);
    }

    if (nextFrontier.length === 0) break;
    nextFrontier.sort((a, b) => b.score - a.score);
    frontier = nextFrontier.slice(0, Math.max(beam, 1));
  }

  completed.push(...frontier);
  completed.sort((a, b) => b.score - a.score);

  const out: Square[][] = [];
  const seen = new Set<string>();
  for (const n of completed) {
    const key = n.path.map((p) => `${p.x},${p.y}`).join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n.path);
    if (out.length >= beam) break;
  }
  return out.length > 0 ? out : [landings];
}

function pathScore(
  root: GameState,
  piece0: ReturnType<typeof pieceById>,
  path: Square[],
  perspective: Side,
  endState: GameState,
): number {
  const settled =
    endState.jumpSequence && endState.status === "playing"
      ? endJumpTurn(endState)
      : endState;
  let score = evaluate(settled, perspective);
  if (piece0?.kind === "royal") {
    const end = path[path.length - 1]!;
    if (isInTargetZone(piece0.side, end)) score += 200_000;
    else {
      score +=
        (progressTowardTarget({ ...piece0, position: end }) -
          progressTowardTarget(piece0)) *
        8_000;
    }
  }
  void root;
  return score;
}

function dedupeTurns(turns: AiTurn[]): AiTurn[] {
  const seen = new Set<string>();
  const out: AiTurn[] = [];
  for (const t of turns) {
    const key =
      t.kind === "step"
        ? `s:${t.pieceId}:${t.to.x},${t.to.y}`
        : `j:${t.pieceId}:${t.landings.map((l) => `${l.x},${l.y}`).join(">")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Apply a full AI turn; settles jump sequence when needed. */
export function applyAiTurn(state: GameState, turn: AiTurn): GameState {
  let s = state;

  if (turn.kind === "step") {
    return applyMove(s, {
      type: "step",
      pieceId: turn.pieceId,
      to: turn.to,
    });
  }

  for (const to of turn.landings) {
    s = applyMove(s, { type: "jump", pieceId: turn.pieceId, to });
    if (s.status !== "playing") return s;
    if (!s.jumpSequence) return s;
  }

  if (s.jumpSequence) {
    s = endJumpTurn(s);
  }
  return s;
}

export function sideToMove(state: GameState): Side {
  return state.turn;
}
