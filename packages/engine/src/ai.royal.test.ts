import { describe, expect, it } from "vitest";
import {
  applyAiTurn,
  chooseAiMove,
  createInitialState,
  listAiTurns,
  raceMeter,
} from "./index";

describe("AI royal activity", () => {
  it("opening has no royal moves until bridges exist", () => {
    const s = createInitialState();
    const turns = listAiTurns(s, "halcon");
    const royalTurns = turns.filter((t) => t.pieceId.includes("royal"));
    expect(royalTurns.length).toBe(0);
  });

  it("expert takes a forward royal jump once a bridge exists", () => {
    let s = createInitialState();
    // Place a same-color bridge directly ahead of a royal.
    s = {
      ...s,
      pieces: s.pieces.map((p) =>
        p.id === "halcon-soldier-5-green"
          ? { ...p, position: { x: 4, y: 1 } }
          : p.id === "halcon-soldier-3-red"
            ? { ...p, position: { x: 7, y: 3 } } // clear (4,2) landing path noise
            : p,
      ),
    };
    // Ensure landing (4,2) empty
    s = {
      ...s,
      pieces: s.pieces.filter(
        (p) => !(p.position.x === 4 && p.position.y === 2),
      ),
    };

    const turn = chooseAiMove(s, {
      difficulty: "expert",
      aiSide: "halcon",
      maxTimeMs: 800,
    });
    expect(turn).not.toBeNull();
    expect(turn!.kind).toBe("jumps");
    expect(turn!.pieceId).toContain("royal");
    if (turn!.kind === "jumps") {
      const end = turn!.landings[turn!.landings.length - 1]!;
      expect(end.y).toBeGreaterThan(0);
    }
  });

  it("expert increases race meter within 24 plies", () => {
    let s = createInitialState();
    const startRace = raceMeter(s, "halcon") + raceMeter(s, "toro");
    let royalForward = 0;
    let royalBack = 0;

    for (let i = 0; i < 24 && s.status === "playing"; i++) {
      const side = s.turn;
      const before = s;
      const turn = chooseAiMove(s, {
        difficulty: "expert",
        aiSide: side,
        maxTimeMs: 400,
      });
      expect(turn).not.toBeNull();
      if (turn!.kind === "jumps" && turn!.pieceId.includes("royal")) {
        const piece = before.pieces.find((p) => p.id === turn!.pieceId)!;
        const end = turn!.landings[turn!.landings.length - 1]!;
        const dp =
          side === "halcon"
            ? end.y - piece.position.y
            : piece.position.y - end.y;
        if (dp > 0) royalForward += 1;
        if (dp < 0) royalBack += 1;
      }
      s = applyAiTurn(s, turn!);
    }

    const endRace = raceMeter(s, "halcon") + raceMeter(s, "toro");
    expect(endRace).toBeGreaterThan(startRace);
    expect(royalForward).toBeGreaterThan(0);
    expect(royalBack).toBeLessThanOrEqual(royalForward);
  }, 40_000);
});
