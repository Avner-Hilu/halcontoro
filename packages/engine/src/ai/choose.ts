import type { GameState, Side } from "../types";
import { isInTargetZone, oppositeSide } from "../types";
import { positionHash, pieceById } from "../utils";
import { applyAiTurn, listAiTurns, type AiTurn } from "./turns";
import {
  evaluate,
  imminentExitBonus,
  nearExitThreat,
  policyBonus,
  progressTowardTarget,
  raceMeter,
} from "./evaluate";

export type AiDifficulty =
  | "beginner"
  | "intermediate"
  | "expert"
  | "master";

export interface ChooseAiMoveOptions {
  difficulty: AiDifficulty;
  aiSide?: Side;
  maxTimeMs?: number;
}

/** Default think-time budgets per difficulty (ms). */
export function defaultThinkTimeMs(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case "master":
      return 10_000;
    case "expert":
      return 4500;
    case "intermediate":
      return 1000;
    default:
      return 350;
  }
}

export function chooseAiMove(
  state: GameState,
  options: ChooseAiMoveOptions,
): AiTurn | null {
  const aiSide = options.aiSide ?? state.turn;
  const turns = listAiTurns(state, aiSide, {
    richPaths: options.difficulty === "master",
  });
  if (turns.length === 0) return null;

  const time = options.maxTimeMs ?? defaultThinkTimeMs(options.difficulty);

  switch (options.difficulty) {
    case "beginner":
      return chooseBeginner(state, turns, aiSide);
    case "intermediate":
      return chooseSearch(state, turns, aiSide, {
        maxDepth: 3,
        maxTimeMs: time,
        branchLimit: 18,
        forceRoyalProgress: true,
        quiescenceDepth: 1,
        masterStyle: false,
      });
    case "expert":
      return chooseSearch(state, turns, aiSide, {
        maxDepth: 6,
        maxTimeMs: time,
        branchLimit: 28,
        forceRoyalProgress: true,
        quiescenceDepth: 2,
        masterStyle: false,
      });
    case "master":
      return chooseSearch(state, turns, aiSide, {
        maxDepth: 7,
        maxTimeMs: time,
        branchLimit: 32,
        forceRoyalProgress: false,
        quiescenceDepth: 3,
        masterStyle: true,
      });
    default:
      return chooseBeginner(state, turns, aiSide);
  }
}

function chooseBeginner(
  state: GameState,
  turns: AiTurn[],
  aiSide: Side,
): AiTurn {
  const weights = turns.map((t) => {
    const after = applyAiTurn(state, t);
    const score = evaluate(after, aiSide) + policyBonus(state, after, aiSide);
    return Math.max(1, score / 200 + 25);
  });
  return weightedPick(turns, weights);
}

interface SearchOptions {
  maxDepth: number;
  maxTimeMs: number;
  branchLimit: number;
  forceRoyalProgress: boolean;
  quiescenceDepth: number;
  masterStyle: boolean;
}

function chooseSearch(
  state: GameState,
  turns: AiTurn[],
  aiSide: Side,
  opts: SearchOptions,
): AiTurn {
  const start = Date.now();
  const tt = new Map<string, TtEntry>();
  let {
    maxDepth,
    maxTimeMs,
    branchLimit,
    forceRoyalProgress,
    quiescenceDepth,
    masterStyle,
  } = opts;

  const exitsTotal =
    state.exitedRoyals.halcon.length + state.exitedRoyals.toro.length;
  if (exitsTotal >= 2) maxDepth += masterStyle ? 1 : 1;
  if (exitsTotal >= 4) maxDepth += 1;

  // Instant own exit.
  for (const turn of orderTurns(state, turns, aiSide, masterStyle)) {
    if (isExitTurn(state, turn)) return turn;
  }

  const opp = oppositeSide(aiSide);
  let candidateTurns = [...turns];

  // HARD RULE: never gift the opponent an immediate exit if preventable.
  candidateTurns = filterOutGiftingExits(state, candidateTurns, opp);

  if (!masterStyle) {
    candidateTurns = applyExpertHeuristics(
      state,
      turns,
      candidateTurns,
      aiSide,
      opp,
      forceRoyalProgress,
    );
  } else {
    // Master: light guidance only — search decides.
    candidateTurns = applyMasterCandidates(state, turns, candidateTurns, aiSide, opp);
  }

  const nonRetreat = candidateTurns.filter((t) => !isRoyalRetreatTurn(state, t));
  if (nonRetreat.length > 0) candidateTurns = nonRetreat;

  const rootOrdered = orderTurns(state, candidateTurns, aiSide, masterStyle);
  let best = rootOrdered[0]!;
  let bestScore = -Infinity;

  // Master: shallow probe of opponent reply to refine root order.
  const ordered =
    masterStyle
      ? orderWithReplyProbe(state, rootOrdered, aiSide, start, maxTimeMs)
      : rootOrdered;

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() - start > maxTimeMs * 0.9) break;

    let iterBest = ordered[0]!;
    let iterScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const turn of ordered) {
      if (Date.now() - start > maxTimeMs) break;
      const next = applyAiTurn(state, turn);
      let score = minimax(
        next,
        depth - 1,
        alpha,
        beta,
        aiSide,
        tt,
        start,
        maxTimeMs,
        branchLimit,
        0,
        quiescenceDepth,
        masterStyle,
      );
      // Policy only at very shallow depths — deep search should own the decision.
      if (depth <= 2) {
        score +=
          policyBonus(state, next, aiSide) * (masterStyle ? 0.25 : 0.65);
      }

      if (score > iterScore) {
        iterScore = score;
        iterBest = turn;
      }
      if (score > alpha) alpha = score;
    }

    if (iterScore > -Infinity) {
      best = iterBest;
      bestScore = iterScore;
    }

    if (bestScore > 700_000 && Date.now() - start > maxTimeMs * 0.45) break;
  }

  return best;
}

/** Drop moves that leave the opponent able to exit, when safer moves exist. */
function filterOutGiftingExits(
  state: GameState,
  turns: AiTurn[],
  opp: Side,
): AiTurn[] {
  const safe: AiTurn[] = [];
  const unsafe: AiTurn[] = [];
  for (const t of turns) {
    const after = applyAiTurn(state, t);
    if (after.status === "ended") {
      // Winning/drawing terminal is fine.
      safe.push(t);
      continue;
    }
    if (after.turn === opp && imminentExitBonus(after, opp) > 0) {
      unsafe.push(t);
    } else {
      safe.push(t);
    }
  }
  return safe.length > 0 ? safe : turns;
}

function applyExpertHeuristics(
  state: GameState,
  allTurns: AiTurn[],
  candidateTurns: AiTurn[],
  aiSide: Side,
  opp: Side,
  forceRoyalProgress: boolean,
): AiTurn[] {
  let candidates = candidateTurns;
  const oppThreat = nearExitThreat(state, opp);
  const exitGap =
    state.exitedRoyals[opp].length - state.exitedRoyals[aiSide].length;

  if (oppThreat > 0) {
    const defensive = allTurns.filter((t) => {
      const after = applyAiTurn(state, t);
      return (
        nearExitThreat(after, opp) < oppThreat ||
        imminentExitBonus(after, opp) < imminentExitBonus(state, opp) ||
        after.exitedRoyals[aiSide].length > state.exitedRoyals[aiSide].length ||
        raceMeter(after, aiSide) > raceMeter(state, aiSide) + 1
      );
    });
    if (defensive.length > 0) candidates = filterOutGiftingExits(state, defensive, opp);
  }

  if (exitGap > 0) {
    const catchUp = candidates.filter((t) => {
      const after = applyAiTurn(state, t);
      return (
        after.exitedRoyals[aiSide].length > state.exitedRoyals[aiSide].length ||
        raceMeter(after, aiSide) - raceMeter(state, aiSide) >= 2 ||
        nearExitThreat(after, opp) < nearExitThreat(state, opp)
      );
    });
    if (catchUp.length > 0) candidates = catchUp;
  }

  if (forceRoyalProgress) {
    const royalProgress = candidates.filter((t) => isRoyalProgressTurn(state, t));
    if (royalProgress.length > 0 && oppThreat === 0) {
      candidates = royalProgress;
    }
  }

  candidates = preferBestRoyalLeap(state, candidates, false);
  return candidates;
}

/**
 * Master candidates: keep a diverse set — denials, sprint, ladder setups —
 * but do not force greed.
 */
function applyMasterCandidates(
  state: GameState,
  allTurns: AiTurn[],
  candidates: AiTurn[],
  aiSide: Side,
  opp: Side,
): AiTurn[] {
  const scored = allTurns.map((t) => ({
    t,
    p: rootPriority(state, t, aiSide, true),
  }));
  scored.sort((a, b) => b.p - a.p);

  // Always keep top static moves.
  const keep = new Map<string, AiTurn>();
  for (const { t } of scored.slice(0, 36)) {
    keep.set(turnKey(t), t);
  }

  // Always keep denials of imminent / near threats.
  const threat = nearExitThreat(state, opp);
  if (threat > 0) {
    for (const t of allTurns) {
      const after = applyAiTurn(state, t);
      if (
        nearExitThreat(after, opp) < threat ||
        imminentExitBonus(after, opp) < imminentExitBonus(state, opp)
      ) {
        keep.set(turnKey(t), t);
      }
    }
  }

  // Keep own exits and meaningful royal progress.
  for (const t of allTurns) {
    if (isExitTurn(state, t) || royalProgressGain(state, t) >= 2) {
      keep.set(turnKey(t), t);
    }
  }

  // Prefer candidates already filtered for gifting.
  const candKeys = new Set(candidates.map(turnKey));
  const out = [...keep.values()].filter((t) => candKeys.has(turnKey(t)));
  return out.length > 0 ? out : candidates;
}

/**
 * Re-order root moves using a cheap 1-ply opponent reply estimate.
 */
function orderWithReplyProbe(
  state: GameState,
  ordered: AiTurn[],
  aiSide: Side,
  start: number,
  maxTimeMs: number,
): AiTurn[] {
  const opp = oppositeSide(aiSide);
  const budget = Math.min(ordered.length, 24);
  const probed = ordered.slice(0, budget).map((t) => {
    if (Date.now() - start > maxTimeMs * 0.2) {
      return { t, score: rootPriority(state, t, aiSide, true) };
    }
    const after = applyAiTurn(state, t);
    let score = evaluate(after, aiSide) + policyBonus(state, after, aiSide) * 0.3;
    if (after.status === "ended") {
      return { t, score: evaluate(after, aiSide) };
    }
    // Opponent's best static reply against us.
    if (after.turn === opp) {
      const replies = listAiTurns(after, opp, { richPaths: false });
      let worst = Infinity;
      const replyOrdered = orderTurns(after, replies, aiSide, true).slice(0, 14);
      for (const r of replyOrdered) {
        const leaf = applyAiTurn(after, r);
        const s = evaluate(leaf, aiSide);
        if (s < worst) worst = s;
      }
      if (worst !== Infinity) score = worst;
      // Extra punish leaving an exit.
      score -= imminentExitBonus(after, opp) * 100_000;
      score -= nearExitThreat(after, opp) * 8_000;
    }
    score += royalProgressGain(state, t) * 3_000;
    return { t, score };
  });

  probed.sort((a, b) => b.score - a.score);
  const head = probed.map((p) => p.t);
  const headKeys = new Set(head.map(turnKey));
  const tail = ordered.filter((t) => !headKeys.has(turnKey(t)));
  return [...head, ...tail];
}

function preferBestRoyalLeap(
  state: GameState,
  turns: AiTurn[],
  masterStyle: boolean,
): AiTurn[] {
  const leaps = turns
    .map((t) => ({ t, gain: royalProgressGain(state, t) }))
    .filter((x) => x.gain > 0);
  if (leaps.length === 0) return turns;
  const maxGain = Math.max(...leaps.map((x) => x.gain));
  if (maxGain <= 1) return turns;

  const threshold = masterStyle && maxGain >= 3 ? maxGain - 1 : maxGain;
  const keep = new Set(
    leaps.filter((x) => x.gain >= threshold).map((x) => turnKey(x.t)),
  );
  for (const t of turns) {
    if (isExitTurn(state, t)) keep.add(turnKey(t));
  }
  const filtered = turns.filter((t) => keep.has(turnKey(t)));
  return filtered.length > 0 ? filtered : turns;
}

function royalProgressGain(state: GameState, turn: AiTurn): number {
  if (turn.kind !== "jumps") return 0;
  const piece = pieceById(state.pieces, turn.pieceId);
  if (!piece || piece.kind !== "royal") return 0;
  const end = turn.landings[turn.landings.length - 1]!;
  if (isInTargetZone(piece.side, end)) return 100;
  return (
    progressTowardTarget({ ...piece, position: end }) -
    progressTowardTarget(piece)
  );
}

function turnKey(t: AiTurn): string {
  return t.kind === "step"
    ? `s:${t.pieceId}:${t.to.x},${t.to.y}`
    : `j:${t.pieceId}:${t.landings.map((l) => `${l.x},${l.y}`).join(">")}`;
}

function isRoyalProgressTurn(state: GameState, turn: AiTurn): boolean {
  return royalProgressGain(state, turn) > 0;
}

function isRoyalRetreatTurn(state: GameState, turn: AiTurn): boolean {
  if (turn.kind !== "jumps") return false;
  const piece = pieceById(state.pieces, turn.pieceId);
  if (!piece || piece.kind !== "royal") return false;
  const end = turn.landings[turn.landings.length - 1]!;
  if (isInTargetZone(piece.side, end)) return false;
  return (
    progressTowardTarget({ ...piece, position: end }) <
    progressTowardTarget(piece)
  );
}

function orderTurns(
  state: GameState,
  turns: AiTurn[],
  aiSide: Side,
  masterStyle: boolean,
): AiTurn[] {
  const cache = new Map<string, number>();
  return [...turns].sort((a, b) => {
    const ka = turnKey(a);
    const kb = turnKey(b);
    if (!cache.has(ka)) cache.set(ka, rootPriority(state, a, aiSide, masterStyle));
    if (!cache.has(kb)) cache.set(kb, rootPriority(state, b, aiSide, masterStyle));
    return cache.get(kb)! - cache.get(ka)!;
  });
}

function rootPriority(
  state: GameState,
  turn: AiTurn,
  aiSide: Side,
  masterStyle: boolean,
): number {
  const after = applyAiTurn(state, turn);
  let score = evaluate(after, aiSide) + policyBonus(state, after, aiSide);

  const gain = royalProgressGain(state, turn);
  // Master: progress is good but not overwhelmingly so vs defense.
  if (gain > 0) score += gain * (masterStyle ? 6_000 : 12_000);
  if (gain >= 100) score += 250_000;

  const opp = oppositeSide(aiSide);
  score -= nearExitThreat(after, opp) * (masterStyle ? 9_000 : 3_500);
  score -= imminentExitBonus(after, opp) * (masterStyle ? 120_000 : 15_000);

  if (masterStyle && after.turn === opp && imminentExitBonus(after, opp) > 0) {
    score -= 250_000;
  }

  return score;
}

interface TtEntry {
  depth: number;
  score: number;
}

/** Minimax with alpha-beta. Scores are always from `aiSide`'s perspective. */
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  aiSide: Side,
  tt: Map<string, TtEntry>,
  start: number,
  maxTimeMs: number,
  branchLimit: number,
  qDepth: number,
  maxQ: number,
  masterStyle: boolean,
): number {
  if (Date.now() - start > maxTimeMs) return evaluate(state, aiSide);
  if (state.status === "ended") return evaluate(state, aiSide);

  if (depth <= 0) {
    if (qDepth < maxQ) {
      const opp = oppositeSide(state.turn);
      const loud = listAiTurns(state, state.turn).filter(
        (t) =>
          isExitTurn(state, t) ||
          royalProgressGain(state, t) >= 2 ||
          imminentExitBonus(applyAiTurn(state, t), opp) <
            imminentExitBonus(state, opp) ||
          (masterStyle && nearExitThreat(applyAiTurn(state, t), opp) <
            nearExitThreat(state, opp)),
      );
      if (loud.length > 0) {
        return searchMoves(
          state,
          loud,
          0,
          alpha,
          beta,
          aiSide,
          tt,
          start,
          maxTimeMs,
          masterStyle ? 18 : 12,
          qDepth + 1,
          maxQ,
          masterStyle,
        );
      }
    }
    return evaluate(state, aiSide);
  }

  const key = `${positionHash(state)}|${state.turn}|d${depth}|q${qDepth}`;
  const cached = tt.get(key);
  if (cached && cached.depth >= depth) return cached.score;

  const turns = listAiTurns(state, state.turn);
  if (turns.length === 0) return evaluate(state, aiSide);

  // Inner nodes: avoid gifting exits when maximizing for us / force opp into
  // weaker lines when minimizing.
  let searchSet = turns;
  if (masterStyle && state.turn === aiSide) {
    searchSet = filterOutGiftingExits(state, turns, oppositeSide(aiSide));
  }

  const score = searchMoves(
    state,
    searchSet,
    depth,
    alpha,
    beta,
    aiSide,
    tt,
    start,
    maxTimeMs,
    branchLimit,
    qDepth,
    maxQ,
    masterStyle,
  );
  tt.set(key, { depth, score });
  return score;
}

function searchMoves(
  state: GameState,
  turns: AiTurn[],
  depth: number,
  alpha: number,
  beta: number,
  aiSide: Side,
  tt: Map<string, TtEntry>,
  start: number,
  maxTimeMs: number,
  branchLimit: number,
  qDepth: number,
  maxQ: number,
  masterStyle: boolean,
): number {
  const maximizing = state.turn === aiSide;
  const ordered = orderTurns(state, turns, aiSide, masterStyle).slice(
    0,
    branchLimit,
  );
  let best = maximizing ? -Infinity : Infinity;

  for (const turn of ordered) {
    if (Date.now() - start > maxTimeMs) break;
    const next = applyAiTurn(state, turn);
    const score = minimax(
      next,
      Math.max(0, depth - 1),
      alpha,
      beta,
      aiSide,
      tt,
      start,
      maxTimeMs,
      branchLimit,
      qDepth,
      maxQ,
      masterStyle,
    );

    if (maximizing) {
      if (score > best) best = score;
      if (score > alpha) alpha = score;
    } else {
      if (score < best) best = score;
      if (score < beta) beta = score;
    }
    if (alpha >= beta) break;
  }

  if (best === Infinity || best === -Infinity) return evaluate(state, aiSide);
  return best;
}

function isExitTurn(state: GameState, turn: AiTurn): boolean {
  if (turn.kind !== "jumps") return false;
  const piece = pieceById(state.pieces, turn.pieceId);
  if (!piece || piece.kind !== "royal") return false;
  const last = turn.landings[turn.landings.length - 1]!;
  return isInTargetZone(piece.side, last);
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
