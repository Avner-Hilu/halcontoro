import { describe, expect, it } from "vitest";
import {
  applyMove,
  createInitialState,
  endJumpTurn,
  getLegalDestinationsForPiece,
  getProgressiveJumpDestinations,
  hasProgressiveJumpContinuation,
  pieceAt,
  pieceById,
  positionHash,
  remainingRoyals,
  settleJumpSequence,
  square,
  tryApplyMove,
  type GameState,
  type Piece,
  type PieceColor,
  type Side,
} from "./index";
import { emptyExited } from "./utils";

function makePiece(
  partial: Omit<Piece, "id"> & { id?: string },
): Piece {
  const id =
    partial.id ??
    `${partial.side}-${partial.kind}-${partial.color}-${partial.position.x}${partial.position.y}`;
  return { ...partial, id };
}

function stateWith(
  pieces: Piece[],
  turn: Side = "halcon",
  extras?: Partial<GameState>,
): GameState {
  const state: GameState = {
    pieces,
    exitedRoyals: emptyExited(),
    turn,
    status: "playing",
    result: null,
    jumpSequence: null,
    positionHistory: [],
    ...extras,
  };
  state.positionHistory = [positionHash(state)];
  return state;
}

describe("opening setup", () => {
  it("places 24 pieces and Halcon to move", () => {
    const s = createInitialState();
    expect(s.pieces).toHaveLength(24);
    expect(s.turn).toBe("halcon");
    expect(remainingRoyals(s, "halcon")).toBe(4);
    expect(remainingRoyals(s, "toro")).toBe(4);
  });
});

describe("R-01 soldier diagonal step", () => {
  it("allows adjacent empty diagonal and switches turn", () => {
    const soldier = makePiece({
      side: "halcon",
      kind: "soldier",
      color: "red",
      position: { x: 3, y: 3 },
    });
    let s = stateWith([soldier], "halcon");
    s = applyMove(s, {
      type: "step",
      pieceId: soldier.id,
      to: square(4, 4),
    });
    expect(pieceById(s.pieces, soldier.id)?.position).toEqual({ x: 4, y: 4 });
    expect(s.turn).toBe("toro");
    expect(s.jumpSequence).toBeNull();
  });
});

describe("R-02 soldier two-square without jump", () => {
  it("rejects moving two squares as a step", () => {
    const soldier = makePiece({
      side: "halcon",
      kind: "soldier",
      color: "red",
      position: { x: 3, y: 3 },
    });
    const s = stateWith([soldier], "halcon");
    const result = tryApplyMove(s, {
      type: "step",
      pieceId: soldier.id,
      to: square(3, 5),
    });
    expect(result.ok).toBe(false);
  });
});

describe("R-03 royal cannot step", () => {
  it("rejects a normal step by a royal", () => {
    const royal = makePiece({
      side: "halcon",
      kind: "royal",
      color: "blue",
      position: { x: 3, y: 3 },
    });
    const s = stateWith([royal], "halcon");
    const dests = getLegalDestinationsForPiece(s, royal);
    expect(dests.every((d) => d.moveType === "jump")).toBe(true);
    const result = tryApplyMove(s, {
      type: "step",
      pieceId: royal.id,
      to: square(3, 4),
    });
    expect(result.ok).toBe(false);
  });
});

describe("R-04 blue jumps over opponent blue", () => {
  it("allows jump over opponent same color into empty", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 2, y: 2 },
    });
    const bridge = makePiece({
      id: "b",
      side: "toro",
      kind: "soldier",
      color: "blue",
      position: { x: 3, y: 2 },
    });
    let s = stateWith([jumper, bridge], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(4, 2) });
    expect(pieceById(s.pieces, "j")?.position).toEqual({ x: 4, y: 2 });
    expect(pieceById(s.pieces, "b")?.position).toEqual({ x: 3, y: 2 });
    expect(s.jumpSequence?.pieceId).toBe("j");
  });
});

describe("R-05 jump over consecutive same-color group", () => {
  it("jumps over soldier + royal of same color", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "royal",
      color: "blue",
      position: { x: 1, y: 1 },
    });
    const a = makePiece({
      id: "a",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 2, y: 1 },
    });
    const b = makePiece({
      id: "b",
      side: "toro",
      kind: "royal",
      color: "blue",
      position: { x: 3, y: 1 },
    });
    let s = stateWith([jumper, a, b], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(4, 1) });
    expect(pieceById(s.pieces, "j")?.position).toEqual({ x: 4, y: 1 });
  });
});

describe("R-06 mixed colors in group illegal", () => {
  it("rejects jump over blue then green", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 1, y: 1 },
    });
    const blue = makePiece({
      id: "bl",
      side: "toro",
      kind: "soldier",
      color: "blue",
      position: { x: 2, y: 1 },
    });
    const green = makePiece({
      id: "gr",
      side: "toro",
      kind: "soldier",
      color: "green",
      position: { x: 3, y: 1 },
    });
    const s = stateWith([jumper, blue, green], "halcon");
    // Landing beyond green would be (4,1) but group is broken — also (3,1) occupied
    // Valid jump over only blue would land on (3,1) but that's occupied by green → illegal
    const dests = getLegalDestinationsForPiece(s, jumper);
    expect(dests.find((d) => d.to.x === 4 && d.to.y === 1)).toBeUndefined();
    expect(dests.find((d) => d.to.x === 3 && d.to.y === 1)).toBeUndefined();
  });
});

describe("R-07 occupied landing illegal", () => {
  it("rejects jump when landing square is occupied", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "red",
      position: { x: 1, y: 1 },
    });
    const mid = makePiece({
      id: "m",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 2, y: 1 },
    });
    const blocker = makePiece({
      id: "k",
      side: "toro",
      kind: "soldier",
      color: "green",
      position: { x: 3, y: 1 },
    });
    const s = stateWith([jumper, mid, blocker], "halcon");
    const result = tryApplyMove(s, {
      type: "jump",
      pieceId: "j",
      to: square(3, 1),
    });
    expect(result.ok).toBe(false);
  });
});

describe("R-08 continue jump in new direction", () => {
  it("allows another jump after landing and end turn", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "red",
      position: { x: 0, y: 0 },
    });
    const a = makePiece({
      id: "a",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 1, y: 0 },
    });
    const b = makePiece({
      id: "b",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 3, y: 1 },
    });
    let s = stateWith([jumper, a, b], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(2, 0) });
    expect(s.jumpSequence).not.toBeNull();
    expect(s.turn).toBe("halcon");

    // From (2,0) jump over (3,1) diagonally to (4,2)
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(4, 2) });
    expect(pieceById(s.pieces, "j")?.position).toEqual({ x: 4, y: 2 });

    s = endJumpTurn(s);
    expect(s.turn).toBe("toro");
    expect(s.jumpSequence).toBeNull();
  });
});

describe("R-09 royal lands in target zone", () => {
  it("removes royal, ends turn, updates exited", () => {
    const royal = makePiece({
      id: "hr",
      side: "halcon",
      kind: "royal",
      color: "green",
      position: { x: 3, y: 4 },
    });
    const bridge = makePiece({
      id: "br",
      side: "toro",
      kind: "soldier",
      color: "green",
      position: { x: 3, y: 5 },
    });
    let s = stateWith([royal, bridge], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "hr", to: square(3, 6) });
    expect(pieceById(s.pieces, "hr")).toBeUndefined();
    expect(s.exitedRoyals.halcon).toContain("green");
    expect(s.turn).toBe("toro");
    expect(s.jumpSequence).toBeNull();
  });
});

describe("R-10 fourth royal removed wins", () => {
  it("ends with royals_exited when last royal exits", () => {
    const royal = makePiece({
      id: "hr",
      side: "halcon",
      kind: "royal",
      color: "red",
      position: { x: 4, y: 5 },
    });
    const bridge = makePiece({
      id: "br",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 4, y: 6 },
    });
    const exited: PieceColor[] = ["blue", "green", "orange"];
    let s = stateWith([royal, bridge], "halcon", {
      exitedRoyals: { halcon: [...exited], toro: [] },
    });
    s = applyMove(s, { type: "jump", pieceId: "hr", to: square(4, 7) });
    expect(s.status).toBe("ended");
    expect(s.result?.winner).toBe("halcon");
    expect(s.result?.reason).toBe("royals_exited");
  });
});

describe("R-11 threefold repetition", () => {
  it("draws when same position+turn appears third time", () => {
    const a = makePiece({
      id: "ha",
      side: "halcon",
      kind: "soldier",
      color: "red",
      position: { x: 0, y: 0 },
    });
    const b = makePiece({
      id: "tb",
      side: "toro",
      kind: "soldier",
      color: "blue",
      position: { x: 7, y: 7 },
    });
    // Cycle restores the opening: after 1st return = 2nd occurrence; after 2nd = draw
    let s = stateWith([a, b], "halcon");
    const startHash = positionHash(s);
    const cycle = () => {
      s = applyMove(s, { type: "step", pieceId: "ha", to: square(1, 0) });
      if (s.status === "ended") return;
      s = applyMove(s, { type: "step", pieceId: "tb", to: square(6, 7) });
      if (s.status === "ended") return;
      s = applyMove(s, { type: "step", pieceId: "ha", to: square(0, 0) });
      if (s.status === "ended") return;
      s = applyMove(s, { type: "step", pieceId: "tb", to: square(7, 7) });
    };

    cycle();
    expect(s.status).toBe("playing");
    expect(positionHash(s)).toBe(startHash);

    cycle();
    expect(s.status).toBe("ended");
    expect(s.result?.reason).toBe("threefold");
    expect(s.result?.winner).toBeNull();
  });
});

describe("R-12 no legal moves → draw", () => {
  it("ends in draw when side to move has no moves", () => {
    // Royal with no adjacent same-color piece and no jumps possible
    const royal = makePiece({
      id: "hr",
      side: "halcon",
      kind: "royal",
      color: "red",
      position: { x: 0, y: 0 },
    });
    // Enemy different color adjacent — cannot jump
    const enemy = makePiece({
      id: "te",
      side: "toro",
      kind: "soldier",
      color: "blue",
      position: { x: 1, y: 0 },
    });
    // After Halcon would somehow pass — we trigger by switching turn onto Halcon with no moves
    // Start as Toro with a move, then after Toro moves Halcon has no moves
    let s = stateWith([royal, enemy], "toro");
    // Toro soldier can step away
    s = applyMove(s, { type: "step", pieceId: "te", to: square(1, 1) });
    // Now Halcon's turn with only a royal that cannot jump (no same-color adjacent)
    expect(s.status).toBe("ended");
    expect(s.result?.reason).toBe("no_moves");
    expect(s.result?.winner).toBeNull();
  });
});

describe("R-13 revisit previous square in jump sequence", () => {
  it("allows jumping back to a square already visited", () => {
    // A -- J -- empty : jump to empty; then can jump back over A
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "orange",
      position: { x: 2, y: 2 },
    });
    const mid = makePiece({
      id: "m",
      side: "toro",
      kind: "soldier",
      color: "orange",
      position: { x: 3, y: 2 },
    });
    let s = stateWith([jumper, mid], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(4, 2) });
    // Jump back over mid to original (2,2)
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(2, 2) });
    expect(pieceById(s.pieces, "j")?.position).toEqual({ x: 2, y: 2 });
    expect(s.jumpSequence?.path.length).toBeGreaterThan(2);
  });
});

describe("progressive jump UX helpers", () => {
  it("treats only-revisit continuation as not progressive and settles turn", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "orange",
      position: { x: 2, y: 2 },
    });
    const mid = makePiece({
      id: "m",
      side: "toro",
      kind: "soldier",
      color: "orange",
      position: { x: 3, y: 2 },
    });
    let s = stateWith([jumper, mid], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(4, 2) });
    expect(s.jumpSequence).not.toBeNull();
    // Only continuation lands on (2,2) which is already on the path
    expect(hasProgressiveJumpContinuation(s)).toBe(false);
    expect(getProgressiveJumpDestinations(s)).toHaveLength(0);
    s = settleJumpSequence(s);
    expect(s.jumpSequence).toBeNull();
    expect(s.turn).toBe("toro");
  });

  it("keeps sequence when a new square is available", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "red",
      position: { x: 0, y: 0 },
    });
    const a = makePiece({
      id: "a",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 1, y: 0 },
    });
    const b = makePiece({
      id: "b",
      side: "toro",
      kind: "soldier",
      color: "red",
      position: { x: 3, y: 1 },
    });
    let s = stateWith([jumper, a, b], "halcon");
    s = applyMove(s, { type: "jump", pieceId: "j", to: square(2, 0) });
    expect(hasProgressiveJumpContinuation(s)).toBe(true);
    expect(
      getProgressiveJumpDestinations(s).some(
        (d) => d.to.x === 4 && d.to.y === 2,
      ),
    ).toBe(true);
    s = settleJumpSequence(s);
    expect(s.jumpSequence).not.toBeNull();
  });
});

describe("R-14 jump off the board illegal", () => {
  it("does not offer landing outside the board", () => {
    const jumper = makePiece({
      id: "j",
      side: "halcon",
      kind: "soldier",
      color: "blue",
      position: { x: 6, y: 0 },
    });
    const mid = makePiece({
      id: "m",
      side: "toro",
      kind: "soldier",
      color: "blue",
      position: { x: 7, y: 0 },
    });
    const s = stateWith([jumper, mid], "halcon");
    const dests = getLegalDestinationsForPiece(s, jumper);
    expect(dests.find((d) => d.to.x === 8)).toBeUndefined();
    const result = tryApplyMove(s, {
      type: "jump",
      pieceId: "j",
      to: square(8, 0),
    });
    expect(result.ok).toBe(false);
  });
});

describe("pieceAt helper", () => {
  it("finds piece on square", () => {
    const s = createInitialState();
    const p = pieceAt(s.pieces, { x: 2, y: 0 });
    expect(p?.kind).toBe("royal");
    expect(p?.side).toBe("halcon");
  });
});
