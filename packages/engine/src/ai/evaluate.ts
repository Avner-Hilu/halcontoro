import type { GameState, Piece, Side, Square } from "../types";
import {
  BOARD_SIZE,
  DIRECTIONS,
  inBounds,
  isInTargetZone,
  oppositeSide,
  squareKey,
} from "../types";
import {
  getAllLegalDestinations,
  getJumpDestinations,
  getLegalDestinationsForPiece,
} from "../moves";

/** Higher is better for `perspective`. */
export function evaluate(state: GameState, perspective: Side): number {
  if (state.status === "ended" && state.result) {
    if (state.result.winner === perspective) return 1_000_000;
    if (state.result.winner === oppositeSide(perspective)) return -1_000_000;
    return 0;
  }

  const me = perspective;
  const opp = oppositeSide(me);

  let score = 0;

  const myExits = state.exitedRoyals[me].length;
  const oppExits = state.exitedRoyals[opp].length;
  const myRace = raceMeter(state, me);
  const oppRace = raceMeter(state, opp);

  // Exits decide the match — nonlinear so catching up / finishing matters.
  score += exitCurve(myExits) * 100_000;
  score -= exitCurve(oppExits) * 115_000;

  // Race position (progress on board + exits already counted lightly in meter).
  score += myRace * 3_000;
  score -= oppRace * 4_400;

  // Sprint: heavily value the furthest royal (finish one, then the next).
  score += sprintScore(state, me);
  score -= sprintScore(state, opp) * 1.4;

  score += royalDetailScore(state, me);
  score -= royalDetailScore(state, opp) * 1.45;

  score += soldierMissionScore(state, me);
  score -= soldierMissionScore(state, opp) * 0.7;

  score += blockadeScore(state, me, opp) * 1.25;
  score -= blockadeScore(state, opp, me) * 1.1;

  score += threatScore(state, me, opp);
  score -= threatScore(state, opp, me) * 1.35;

  // Scoreboard panic / pressure.
  const exitGap = oppExits - myExits;
  if (exitGap > 0) score -= exitGap * 70_000;
  if (exitGap < 0) score += -exitGap * 22_000;

  if (oppRace > myRace) {
    score -= (oppRace - myRace) * 3_600;
  }

  // Near end: every tempo is huge.
  if (myExits >= 2 || oppExits >= 2) {
    score += (myRace - oppRace) * 2_800;
    score -= imminentExitBonus(state, opp) * 35_000;
    score += imminentExitBonus(state, me) * 14_000;
  }

  // Always punish opponent being able to exit on their turn.
  if (state.turn === opp) {
    score -= imminentExitBonus(state, opp) * 45_000;
  } else {
    score -= imminentExitBonus(state, opp) * 18_000;
  }

  const mobility = countMoves(state);
  score += state.turn === me ? mobility * 0.8 : -mobility * 0.8;

  return score;
}

function exitCurve(n: number): number {
  // 0,1,2,3,4 → accelerating value toward the win.
  const table = [0, 1, 2.35, 4.1, 7];
  return table[Math.min(4, Math.max(0, n))] ?? n;
}

/** Prefer concentrating progress on the leading royal(s). */
function sprintScore(state: GameState, side: Side): number {
  const progs = state.pieces
    .filter((p) => p.side === side && p.kind === "royal")
    .map((p) => progressTowardTarget(p))
    .sort((a, b) => b - a);

  if (progs.length === 0) return state.exitedRoyals[side].length * 40_000;

  let score = state.exitedRoyals[side].length * 40_000;
  // Best royal dominates.
  score += (progs[0] ?? 0) * (progs[0] ?? 0) * 120;
  // Second best still matters, but less.
  if (progs[1] !== undefined) score += progs[1] * progs[1] * 45;
  // Royals deep in enemy half are urgent to finish.
  for (const p of progs) {
    if (p >= 5) score += 8_000 + (p - 5) * 6_000;
    if (p >= 6) score += 12_000;
  }
  return score;
}

/**
 * Threats: imminent exits, near-zone royals with bridges, opponent forward options.
 */
function threatScore(state: GameState, me: Side, opp: Side): number {
  let score = 0;
  score += imminentExitBonus(state, me) * 18_000;
  score -= imminentExitBonus(state, opp) * 28_000;

  for (const royal of state.pieces) {
    if (royal.side !== opp || royal.kind !== "royal") continue;
    const prog = progressTowardTarget(royal);
    const jumps = getJumpDestinations(
      state.pieces,
      royal.position,
      royal.color,
    );
    const forward = jumps.filter(
      (to) =>
        isForwardFor(opp, royal.position, to) || isInTargetZone(opp, to),
    );
    if (prog >= 3 && forward.length > 0) {
      score -= 4_500 + prog * 1_400;
    }
    if (prog >= 4) {
      score -= 5_000;
      if (jumps.some((to) => isInTargetZone(opp, to))) score -= 30_000;
    }
    if (prog >= 5) {
      score -= 8_000;
    }
  }

  // Reward denying opponent their best forward landing this "ply" conceptually
  // (static: fewer forward jumps available to opp royals).
  let oppForwardOptions = 0;
  for (const royal of state.pieces) {
    if (royal.side !== opp || royal.kind !== "royal") continue;
    oppForwardOptions += getJumpDestinations(
      state.pieces,
      royal.position,
      royal.color,
    ).filter((to) => isForwardFor(opp, royal.position, to)).length;
  }
  score -= oppForwardOptions * 400;

  return score;
}

/** 0..~40 style meter: exits*10 + sum of royal progress. */
export function raceMeter(state: GameState, side: Side): number {
  let meter = state.exitedRoyals[side].length * 10;
  for (const p of state.pieces) {
    if (p.side === side && p.kind === "royal") {
      meter += progressTowardTarget(p);
    }
  }
  return meter;
}

function royalDetailScore(state: GameState, side: Side): number {
  let score = 0;
  const royals = state.pieces.filter((p) => p.side === side && p.kind === "royal");

  for (const royal of royals) {
    const prog = progressTowardTarget(royal);
    score += prog * prog * 70;

    const jumps = getJumpDestinations(state.pieces, royal.position, royal.color);
    const forward = jumps.filter((to) => isForwardFor(side, royal.position, to));
    const exits = jumps.filter((to) => isInTargetZone(side, to));

    if (exits.length > 0) score += 22_000;
    else if (forward.length > 0) {
      score += 2_400 + forward.length * 400;
      const best = Math.max(
        ...forward.map((to) =>
          progressTowardTarget({ ...royal, position: to }),
        ),
      );
      score += (best - prog) * 1_100;
      // Prefer landings that keep forward options / approach zone.
      for (const to of forward) {
        if (progressTowardTarget({ ...royal, position: to }) >= 5) {
          score += 3_000;
        }
      }
    } else if (jumps.length === 0) {
      score -= 6_500 + (7 - prog) * 320;
    }

    if (isInTargetZone(side, royal.position)) score += 6_000;

    const helpers = state.pieces.filter(
      (p) => p.color === royal.color && p.id !== royal.id,
    );
    if (helpers.length === 0) score -= 3_500;

    for (const h of helpers) {
      const dist = chebyshev(h.position, royal.position);
      if (dist === 1) {
        if (forward.length === 0 && jumps.length === 0) {
          score += 600;
          if (isForwardFor(side, royal.position, h.position)) score += 1_600;
        } else if (forward.length === 0) {
          if (isForwardFor(side, royal.position, h.position)) score += 700;
        }
      } else if (jumps.length === 0) {
        score += Math.max(0, 500 - dist * 120);
      }

      // Ladder rungs ahead toward the target zone.
      if (
        isForwardFor(side, royal.position, h.position) &&
        progressTowardTarget(h) > prog
      ) {
        const gap = progressTowardTarget(h) - prog;
        if (gap >= 1 && gap <= 3) score += 350 + (3 - gap) * 120;
      }
    }
  }
  return score;
}

function soldierMissionScore(state: GameState, side: Side): number {
  let score = 0;
  const soldiers = state.pieces.filter((p) => p.side === side && p.kind === "soldier");
  const royals = state.pieces.filter((p) => p.side === side && p.kind === "royal");
  const opp = oppositeSide(side);

  // Focus helpers on the leading royal of each color / overall leader.
  const leadProg = Math.max(
    0,
    ...royals.map((r) => progressTowardTarget(r)),
  );

  for (const soldier of soldiers) {
    const match = royals.filter((r) => r.color === soldier.color);
    if (match.length === 0) {
      // Free soldiers: park on opponent forward-landing squares / near their leaders.
      score += defensiveSoldierScore(state, soldier, opp);
      continue;
    }

    for (const royal of match) {
      const dist = chebyshev(soldier.position, royal.position);
      const royalCanMove =
        getJumpDestinations(state.pieces, royal.position, royal.color).length >
        0;
      const forwardJumps = getJumpDestinations(
        state.pieces,
        royal.position,
        royal.color,
      ).filter(
        (to) =>
          isForwardFor(side, royal.position, to) || isInTargetZone(side, to),
      );

      const isLeader = progressTowardTarget(royal) >= leadProg - 1;
      const leadMul = isLeader ? 1.35 : 0.85;

      if (!royalCanMove) {
        score += Math.max(0, 750 - dist * 150) * leadMul;
        if (dist === 1) {
          score += 950 * leadMul;
          if (isForwardFor(side, royal.position, soldier.position)) {
            score += 2_000 * leadMul;
          }
        }
      } else if (forwardJumps.length === 0) {
        if (dist === 1 && isForwardFor(side, royal.position, soldier.position)) {
          score += 1_000 * leadMul;
        }
      } else {
        // Extend ladder ahead toward target, especially for the leader.
        if (isForwardFor(side, royal.position, soldier.position)) {
          const ahead = progressTowardTarget(soldier) - progressTowardTarget(royal);
          if (ahead >= 1 && ahead <= 3) {
            score += (420 - ahead * 60) * leadMul;
          }
          if (dist >= 2 && dist <= 4) {
            score += (140 + progressTowardTarget(soldier) * 6) * leadMul;
          }
        }
      }
    }

    // Dual-purpose: also block if near an opponent royal approach.
    score += defensiveSoldierScore(state, soldier, opp) * 0.45;
  }
  return score;
}

function defensiveSoldierScore(
  state: GameState,
  soldier: Piece,
  enemySide: Side,
): number {
  let score = 0;
  for (const royal of state.pieces) {
    if (royal.side !== enemySide || royal.kind !== "royal") continue;
    const prog = progressTowardTarget(royal);
    if (prog < 3) continue;

    const landings = getJumpDestinations(
      state.pieces,
      royal.position,
      royal.color,
    );
    for (const to of landings) {
      if (to.x === soldier.position.x && to.y === soldier.position.y) {
        score += 3_200;
        if (isForwardFor(enemySide, royal.position, to)) score += 2_800;
        if (isInTargetZone(enemySide, to)) score += 14_000;
      }
    }

    // Sit in front of advanced enemy royals (clog the lane).
    if (
      isForwardFor(enemySide, royal.position, soldier.position) &&
      chebyshev(soldier.position, royal.position) <= 2
    ) {
      score += 180 + prog * 40;
    }
  }
  return score;
}

function blockadeScore(
  state: GameState,
  blockerSide: Side,
  enemySide: Side,
): number {
  const enemyRoyals = state.pieces.filter(
    (p) => p.side === enemySide && p.kind === "royal",
  );
  const myPieces = state.pieces.filter((p) => p.side === blockerSide);
  const occ = new Set(myPieces.map((p) => squareKey(p.position)));

  let score = 0;
  for (const royal of enemyRoyals) {
    const prog = progressTowardTarget(royal);
    const landings = getJumpDestinations(
      state.pieces,
      royal.position,
      royal.color,
    );
    for (const to of landings) {
      if (!occ.has(squareKey(to))) continue;
      const urgency = 1 + prog * 0.35;
      score += 3_000 * urgency;
      if (isForwardFor(enemySide, royal.position, to)) score += 3_000 * urgency;
      if (isInTargetZone(enemySide, to)) score += 16_000;
    }

    // Disrupt same-color bridge rungs ahead of advanced enemy royals.
    if (prog >= 3) {
      for (const d of DIRECTIONS) {
        const sq = { x: royal.position.x + d.x, y: royal.position.y + d.y };
        if (!inBounds(sq)) continue;
        if (!isForwardFor(enemySide, royal.position, sq)) continue;
        const bridge = state.pieces.find(
          (p) =>
            p.position.x === sq.x &&
            p.position.y === sq.y &&
            p.color === royal.color,
        );
        if (!bridge) continue;
        // Our piece adjacent to their bridge can contest the lane.
        for (const mine of myPieces) {
          if (chebyshev(mine.position, sq) === 1) score += 220 * prog;
        }
      }
    }
  }
  return score;
}

export function progressTowardTarget(p: Piece): number {
  if (p.side === "halcon") return p.position.y;
  return BOARD_SIZE - 1 - p.position.y;
}

export function isForwardFor(side: Side, from: Square, to: Square): boolean {
  if (side === "halcon") return to.y > from.y;
  return to.y < from.y;
}

function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function imminentExitBonus(state: GameState, side: Side): number {
  if (state.status !== "playing") return 0;
  let exits = 0;
  for (const royal of state.pieces) {
    if (royal.side !== side || royal.kind !== "royal") continue;
    const jumps =
      state.turn === side && !state.jumpSequence
        ? getLegalDestinationsForPiece(state, royal)
            .filter((d) => d.moveType === "jump")
            .map((d) => d.to)
        : getJumpDestinations(state.pieces, royal.position, royal.color);
    if (jumps.some((to) => isInTargetZone(side, to))) exits += 1;
  }
  return exits;
}

/** Opponent (or side) has a royal that is dangerously close to exiting soon. */
export function nearExitThreat(state: GameState, side: Side): number {
  let threat = imminentExitBonus(state, side) * 4;
  for (const royal of state.pieces) {
    if (royal.side !== side || royal.kind !== "royal") continue;
    const prog = progressTowardTarget(royal);
    const forward = getJumpDestinations(
      state.pieces,
      royal.position,
      royal.color,
    ).filter(
      (to) =>
        isForwardFor(side, royal.position, to) || isInTargetZone(side, to),
    );
    if (prog >= 5) threat += 3;
    else if (prog >= 4 && forward.length > 0) threat += 2;
    else if (prog >= 3 && forward.length > 0) threat += 1;
  }
  return threat;
}

function countMoves(state: GameState): number {
  let n = 0;
  for (const dests of getAllLegalDestinations(state).values()) n += dests.length;
  return n;
}

/**
 * Root policy: reward forward royal progress / bridge unlocks / denials.
 * Heavily punish royal retreats (the forward-back shuffle).
 */
export function policyBonus(
  before: GameState,
  after: GameState,
  aiSide: Side,
): number {
  let bonus = 0;
  const opp = oppositeSide(aiSide);

  const myExitDelta =
    after.exitedRoyals[aiSide].length - before.exitedRoyals[aiSide].length;
  const oppExitDelta =
    after.exitedRoyals[opp].length - before.exitedRoyals[opp].length;
  bonus += myExitDelta * 120_000;
  bonus -= oppExitDelta * 140_000;

  const beforeRace = raceMeter(before, aiSide);
  const afterRace = raceMeter(after, aiSide);
  const raceDelta = afterRace - beforeRace;
  bonus += raceDelta * 14_000;
  if (raceDelta < 0) bonus += raceDelta * 10_000;

  const oppRaceDelta = raceMeter(after, opp) - raceMeter(before, opp);
  bonus -= oppRaceDelta * 9_000;

  // Finish-line sprint: advancing the current leader is worth more.
  const beforeLead = bestRoyalProgress(before, aiSide);
  const afterLead = bestRoyalProgress(after, aiSide);
  if (afterLead > beforeLead) bonus += (afterLead - beforeLead) * 8_000;
  if (afterLead >= 5 && afterLead > beforeLead) bonus += 10_000;

  for (const br of before.pieces) {
    if (br.side !== aiSide || br.kind !== "royal") continue;
    const ar = after.pieces.find((p) => p.id === br.id);
    if (!ar) continue;
    const dp = progressTowardTarget(ar) - progressTowardTarget(br);
    if (dp > 0) bonus += dp * 15_000;
    if (dp < 0) bonus += dp * 18_000;
    if (dp === 0) {
      const moved =
        ar.position.x !== br.position.x || ar.position.y !== br.position.y;
      if (moved) bonus -= 5_000;
    }
  }

  for (const br of before.pieces) {
    if (br.side !== aiSide || br.kind !== "royal") continue;
    const ar = after.pieces.find((p) => p.id === br.id);
    if (!ar) continue;
    const forwardBefore = countForwardJumps(before, br, aiSide);
    const forwardAfter = countForwardJumps(after, ar, aiSide);
    if (forwardBefore === 0 && forwardAfter > 0) bonus += 5_000;
  }

  bonus +=
    (imminentExitBonus(before, opp) - imminentExitBonus(after, opp)) * 14_000;
  bonus +=
    (nearExitThreat(before, opp) - nearExitThreat(after, opp)) * 4_500;

  // New forward bridge only if royal had no forward jump yet.
  for (const royal of after.pieces) {
    if (royal.side !== aiSide || royal.kind !== "royal") continue;
    const beforeRoyal = before.pieces.find((p) => p.id === royal.id);
    if (!beforeRoyal) continue;
    if (countForwardJumps(before, beforeRoyal, aiSide) > 0) continue;

    for (const d of DIRECTIONS) {
      const sq = { x: royal.position.x + d.x, y: royal.position.y + d.y };
      if (!inBounds(sq)) continue;
      if (!isForwardFor(aiSide, royal.position, sq)) continue;
      const now = after.pieces.find(
        (p) =>
          p.position.x === sq.x &&
          p.position.y === sq.y &&
          p.color === royal.color &&
          p.id !== royal.id,
      );
      const was = before.pieces.find(
        (p) =>
          p.position.x === sq.x &&
          p.position.y === sq.y &&
          p.color === royal.color &&
          p.id !== royal.id,
      );
      if (now && !was) bonus += 3_200;
    }
  }

  // Prefer creating/extending a ladder in front of the leading royal.
  bonus += ladderExtensionBonus(before, after, aiSide);

  return bonus;
}

function bestRoyalProgress(state: GameState, side: Side): number {
  let best = 0;
  for (const p of state.pieces) {
    if (p.side === side && p.kind === "royal") {
      best = Math.max(best, progressTowardTarget(p));
    }
  }
  return best;
}

function countForwardJumps(state: GameState, royal: Piece, side: Side): number {
  return getJumpDestinations(state.pieces, royal.position, royal.color).filter(
    (to) => isForwardFor(side, royal.position, to) || isInTargetZone(side, to),
  ).length;
}

function ladderExtensionBonus(
  before: GameState,
  after: GameState,
  aiSide: Side,
): number {
  let bonus = 0;
  const royals = after.pieces.filter(
    (p) => p.side === aiSide && p.kind === "royal",
  );
  if (royals.length === 0) return 0;
  const leader = royals.reduce((a, b) =>
    progressTowardTarget(a) >= progressTowardTarget(b) ? a : b,
  );
  const prog = progressTowardTarget(leader);

  for (const p of after.pieces) {
    if (p.side !== aiSide || p.kind !== "soldier") continue;
    if (p.color !== leader.color) continue;
    const was = before.pieces.find((x) => x.id === p.id);
    if (!was) continue;
    if (was.position.x === p.position.x && was.position.y === p.position.y) {
      continue;
    }
    if (!isForwardFor(aiSide, leader.position, p.position)) continue;
    const ahead = progressTowardTarget(p) - prog;
    if (ahead >= 1 && ahead <= 3) bonus += 2_200;
    if (chebyshev(p.position, leader.position) <= 3) bonus += 600;
  }
  return bonus;
}
