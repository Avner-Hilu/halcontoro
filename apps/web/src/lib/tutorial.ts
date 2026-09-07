import type {
  GameState,
  Piece,
  PieceColor,
  Side,
  Square,
} from "@halcontoro/engine";
import { positionHash } from "@halcontoro/engine";

export type TutorialStepId =
  | "goal"
  | "pieces"
  | "step"
  | "jump"
  | "royal"
  | "chain"
  | "exit"
  | "done";

export type TutorialStepKind = "info" | "practice" | "done";

export interface TutorialStep {
  id: TutorialStepId;
  kind: TutorialStepKind;
  title: string;
  body: string;
  hint?: string;
  /** Piece the learner must interact with (practice). */
  focusPieceId?: string;
  /** Allowed destination(s) to complete the step. */
  successSquares?: Square[];
  /** For chain: require this many jump landings in the sequence. */
  requireJumpCount?: number;
  /** Complete when a royal of this color has exited. */
  requireExitColor?: PieceColor;
}

function piece(
  id: string,
  side: Side,
  kind: "royal" | "soldier",
  color: PieceColor,
  x: number,
  y: number,
): Piece {
  return { id, side, kind, color, position: { x, y } };
}

function stateFrom(pieces: Piece[], turn: Side = "halcon"): GameState {
  const state: GameState = {
    pieces,
    exitedRoyals: { halcon: [], toro: [] },
    turn,
    status: "playing",
    result: null,
    jumpSequence: null,
    positionHistory: [],
  };
  state.positionHistory = [positionHash(state)];
  return state;
}

/** Sparse boards for each lesson — Halcon at bottom (y low). */
export function boardForStep(id: TutorialStepId): GameState {
  switch (id) {
    case "goal":
      return stateFrom([
        piece("hr", "halcon", "royal", "red", 3, 0),
        piece("hg", "halcon", "royal", "green", 4, 0),
        piece("hs", "halcon", "soldier", "red", 3, 2),
        piece("tr", "toro", "royal", "blue", 3, 7),
        piece("tg", "toro", "royal", "orange", 4, 7),
      ]);
    case "pieces":
      return stateFrom([
        piece("hr", "halcon", "royal", "red", 2, 1),
        piece("ho", "halcon", "royal", "orange", 5, 1),
        piece("hs1", "halcon", "soldier", "red", 2, 3),
        piece("hs2", "halcon", "soldier", "orange", 5, 3),
        piece("hs3", "halcon", "soldier", "blue", 3, 4),
        piece("hs4", "halcon", "soldier", "green", 4, 4),
      ]);
    case "step":
      return stateFrom([
        piece("soldier", "halcon", "soldier", "blue", 3, 3),
        piece("decoy", "halcon", "soldier", "green", 6, 1),
      ]);
    case "jump":
      return stateFrom([
        piece("jumper", "halcon", "soldier", "red", 3, 2),
        piece("bridge", "toro", "soldier", "red", 3, 3),
        piece("blocker", "halcon", "soldier", "blue", 6, 6),
      ]);
    case "royal":
      return stateFrom([
        piece("royal", "halcon", "royal", "green", 4, 2),
        piece("bridge", "halcon", "soldier", "green", 4, 3),
        piece("other", "halcon", "soldier", "blue", 1, 1),
      ]);
    case "chain":
      return stateFrom([
        piece("chain", "halcon", "soldier", "orange", 2, 1),
        piece("b1", "toro", "soldier", "orange", 2, 2),
        piece("b2", "halcon", "soldier", "orange", 2, 4),
        piece("spare", "halcon", "soldier", "blue", 7, 7),
      ]);
    case "exit":
      return stateFrom([
        piece("exiter", "halcon", "royal", "red", 4, 5),
        piece("bridge", "toro", "soldier", "red", 4, 6),
        piece("watch", "halcon", "soldier", "blue", 0, 0),
      ]);
    case "done":
      return stateFrom([
        piece("hr", "halcon", "royal", "red", 3, 4),
        piece("hs", "halcon", "soldier", "red", 3, 5),
      ]);
  }
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "goal",
    kind: "info",
    title: "המטרה",
    body: "נצחו כשמעבירים את כל ארבעת הכלים המלכותיים לאזור היעד של היריב — שתי השורות הרחוקות (מסומנות בקווים על הלוח). אין אכילות: הכלים נשארים על הלוח עד שיציאה מהלוח דרך אזור היעד.",
  },
  {
    id: "pieces",
    kind: "info",
    title: "כלים וצבעים",
    body: "לכל צד יש מלכותיים וחיילים בארבעה צבעים. קפיצה אפשרית רק מעל כלים באותו צבע (שלך או של היריב). חיילים יכולים גם לצעוד משבצת אחת לכל כיוון; מלכותיים קופצים בלבד.",
  },
  {
    id: "step",
    kind: "practice",
    title: "צעד של חייל",
    body: "חייל זז משבצת אחת לכל כיוון (כולל אלכסון), למשבצת ריקה.",
    hint: "בחרו את החייל הכחול והזיזו אותו משבצת אחת קדימה (למעלה).",
    focusPieceId: "soldier",
    successSquares: [
      { x: 3, y: 4 },
      { x: 2, y: 4 },
      { x: 4, y: 4 },
    ],
  },
  {
    id: "jump",
    kind: "practice",
    title: "קפיצה",
    body: "קופצים מעל קבוצה רציפה של כלים באותו צבע, ונחתים במשבצת הריקה הראשונה אחריה.",
    hint: "בחרו את החייל האדום וקפצו מעל הכלי האדום קדימה.",
    focusPieceId: "jumper",
    successSquares: [{ x: 3, y: 4 }],
  },
  {
    id: "royal",
    kind: "practice",
    title: "מלכותי — קפיצה בלבד",
    body: "מלכותיים לא צועדים. הם מתקדמים רק בקפיצות — לכן חשוב לבנות להם \"גשר\" מכלים באותו צבע.",
    hint: "בחרו את המלכותי הירוק וקפצו מעל החייל הירוק קדימה.",
    focusPieceId: "royal",
    successSquares: [{ x: 4, y: 4 }],
  },
  {
    id: "chain",
    kind: "practice",
    title: "רצף קפיצות",
    body: "אחרי קפיצה אפשר להמשיך לקפוץ עם אותו כלי באותו תור, כל עוד יש נחיתה למשבצת חדשה. אפשר גם לסיים את התור.",
    hint: "קפצו פעמיים קדימה עם החייל הכתום (מעל שני הגשרים).",
    focusPieceId: "chain",
    successSquares: [{ x: 2, y: 5 }],
    requireJumpCount: 2,
  },
  {
    id: "exit",
    kind: "practice",
    title: "יציאה ליעד",
    body: "כשמלכותי נוחת באזור היעד של היריב — הוא יוצא מהלוח. הראשון שמוציא ארבעה מלכותיים מנצח.",
    hint: "קפצו עם המלכותי האדום לאזור היעד (למעלה).",
    focusPieceId: "exiter",
    successSquares: [{ x: 4, y: 7 }],
    requireExitColor: "red",
  },
  {
    id: "done",
    kind: "done",
    title: "מוכנים לשחק!",
    body: "יש לכם את הבסיס: מטרה, צעד, קפיצה, מלכותיים, רצף ויציאה. עכשיו אפשר לתרגל מול המחשב או לשחק עם חבר.",
  },
];

export function stepIndex(id: TutorialStepId): number {
  return TUTORIAL_STEPS.findIndex((s) => s.id === id);
}
