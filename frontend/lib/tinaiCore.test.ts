// Ported test suite — same scenarios as backend/local-test.js (happy
// path, retry-on-invalid-classification, double-failure shaped error,
// empty-input validation, unknown-mode rejection), run against the
// ported core module instead of the standalone Lambda. Adds coverage
// for the new deterministic fallback path (USE_BEDROCK=false), which
// didn't exist in the original Lambda version.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THINAI_KEYS, ThinaiEntry, ThinaiKey } from "./thinai";
import type { PoemRecord, ScoreState } from "./dynamo";

type PutPoemArgs = PoemRecord;

const putPoemMock = vi.fn<(item: PutPoemArgs) => Promise<void>>(async () => {});
const getScoreMock = vi.fn<(sessionId: string) => Promise<ScoreState | null>>();
const putScoreMock = vi.fn<(sessionId: string, state: ScoreState) => Promise<void>>(async () => {});
const getRecentPoemsMock = vi.fn<(limit: number) => Promise<PoemRecord[]>>();

vi.mock("./dynamo", () => ({
  putPoem: putPoemMock,
  getScore: getScoreMock,
  putScore: putScoreMock,
  getRecentPoems: getRecentPoemsMock,
}));

const classifyThinaiMock = vi.fn<(situation: string) => Promise<{ thinai: ThinaiKey; reason: string }>>();
const writeStanzaMock =
  vi.fn<(situation: string, thinaiData: ThinaiEntry, thinaiKey: ThinaiKey) => Promise<{ english: string; tamil: string }>>();

vi.mock("./bedrock", () => ({
  classifyThinai: classifyThinaiMock,
  writeStanza: writeStanzaMock,
}));

async function loadCore(useBedrock: boolean) {
  vi.resetModules();
  process.env.USE_BEDROCK = useBedrock ? "true" : "false";
  const mod = await import("./tinaiCore");
  return mod.handleRequest;
}

beforeEach(() => {
  putPoemMock.mockClear();
  classifyThinaiMock.mockReset();
  writeStanzaMock.mockReset();
  getScoreMock.mockReset();
  putScoreMock.mockClear();
  getRecentPoemsMock.mockReset();
});

afterEach(() => {
  delete process.env.USE_BEDROCK;
});

describe("USE_BEDROCK=true (mocked Bedrock)", () => {
  it("happy path: valid classify JSON returns shaped poem and persists to DynamoDB", async () => {
    classifyThinaiMock.mockResolvedValueOnce({ thinai: "neithal", reason: "anxious pining fits neithal" });
    writeStanzaMock.mockResolvedValueOnce({
      english: "gulls circle low where the tide has not yet turned",
      tamil: "கடல் நுரையில் தென்றல் அலைகிறது",
    });

    const handleRequest = await loadCore(true);
    const res = await handleRequest({ mode: "create", situation: "Waiting to hear back after a job interview" });

    expect(res.statusCode).toBe(200);
    expect(res.payload.thinai).toBe("neithal");
    expect((res.payload.poem as string).length).toBeGreaterThan(0);
    expect((res.payload.poemTamil as string).length).toBeGreaterThan(0);
    expect(putPoemMock).toHaveBeenCalledTimes(1);
    expect((putPoemMock.mock.calls[0][0] as { thinai: string }).thinai).toBe("neithal");
    expect((putPoemMock.mock.calls[0][0] as { poemTamil?: string }).poemTamil).toBeTruthy();
  });

  it("propagates a classify failure (e.g. two invalid attempts) as a shaped 502, never throws", async () => {
    classifyThinaiMock.mockRejectedValueOnce(new Error("Bedrock did not return a valid thinai after retry"));

    const handleRequest = await loadCore(true);
    const res = await handleRequest({ mode: "create", situation: "Some situation" });

    expect(res.statusCode).toBe(502);
    expect(res.payload.error).toBe(true);
    expect(putPoemMock).not.toHaveBeenCalled();
  });

  it("empty situation returns 400 without calling Bedrock", async () => {
    const handleRequest = await loadCore(true);
    const res = await handleRequest({ mode: "create", situation: "   " });

    expect(res.statusCode).toBe(400);
    expect(classifyThinaiMock).not.toHaveBeenCalled();
  });

  it("unimplemented mode returns shaped 400, not a throw", async () => {
    const handleRequest = await loadCore(true);
    const res = await handleRequest({ mode: "bogus" });

    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBe(true);
  });

  it("play mode calls writeStanza only (no classify call) and returns a giveaway from thinai data", async () => {
    writeStanzaMock.mockResolvedValueOnce({ english: "a stanza", tamil: "ஒரு பாடல்" });

    const handleRequest = await loadCore(true);
    const res = await handleRequest({ mode: "play" });

    expect(res.statusCode).toBe(200);
    expect(classifyThinaiMock).not.toHaveBeenCalled();
    expect(writeStanzaMock).toHaveBeenCalledTimes(1);
    expect(THINAI_KEYS).toContain(res.payload.answer);
    expect(typeof res.payload.giveaway).toBe("string");
    expect(res.payload.poemTamil).toBe("ஒரு பாடல்");
  });

  it("propagates a mood-word-leak failure after retry as a shaped 502, never throws", async () => {
    writeStanzaMock.mockRejectedValueOnce(new Error("Bedrock named the emotion directly after retry"));

    const handleRequest = await loadCore(true);
    const res = await handleRequest({ mode: "play" });

    expect(res.statusCode).toBe(502);
    expect(res.payload.error).toBe(true);
  });
});

describe("USE_BEDROCK=false (deterministic fallback, default)", () => {
  it("create mode classifies by keyword and returns a pre-written stanza without calling Bedrock", async () => {
    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "create", situation: "Waiting to hear back after a job interview" });

    expect(res.statusCode).toBe(200);
    expect(res.payload.thinai).toBe("neithal");
    expect(classifyThinaiMock).not.toHaveBeenCalled();
    expect(writeStanzaMock).not.toHaveBeenCalled();
    expect(putPoemMock).toHaveBeenCalledTimes(1);
  });

  it("create mode is deterministic: same situation always yields the same stanza", async () => {
    const handleRequest = await loadCore(false);
    const res1 = await handleRequest({ mode: "create", situation: "Had a big fight with my best friend" });
    const res2 = await handleRequest({ mode: "create", situation: "Had a big fight with my best friend" });

    expect(res1.payload.poem).toBe(res2.payload.poem);
    expect(res1.payload.thinai).toBe("marutham");
  });

  it("create mode with no keyword match defaults deterministically rather than erroring", async () => {
    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "create", situation: "asdf qwer zxcv" });

    expect(res.statusCode).toBe(200);
    expect(THINAI_KEYS).toContain(res.payload.thinai);
  });

  it("play mode returns the pre-written stanza tied to the chosen seed situation", async () => {
    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "play" });

    expect(res.statusCode).toBe(200);
    expect(THINAI_KEYS).toContain(res.payload.answer);
    expect((res.payload.poem as string).length).toBeGreaterThan(0);
    expect(typeof res.payload.giveaway).toBe("string");
  });

  it("empty situation still returns 400 in fallback mode", async () => {
    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "create", situation: "" });

    expect(res.statusCode).toBe(400);
    expect(putPoemMock).not.toHaveBeenCalled();
  });
});

describe("score mode (Bedrock-independent)", () => {
  it("first play ever: correct guess starts streak at 1", async () => {
    getScoreMock.mockResolvedValueOnce(null);

    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "score", sessionId: "s1", correct: true });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ currentStreak: 1, bestStreak: 1 });
    expect(putScoreMock).toHaveBeenCalledWith("s1", { currentStreak: 1, bestStreak: 1, plays: 1 });
  });

  it("correct guess increments an existing streak and raises bestStreak with it", async () => {
    getScoreMock.mockResolvedValueOnce({ currentStreak: 2, bestStreak: 4, plays: 9 });

    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "score", sessionId: "s1", correct: true });

    expect(res.payload).toEqual({ currentStreak: 3, bestStreak: 4 });
  });

  it("correct guess raises bestStreak once currentStreak passes it", async () => {
    getScoreMock.mockResolvedValueOnce({ currentStreak: 4, bestStreak: 4, plays: 9 });

    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "score", sessionId: "s1", correct: true });

    expect(res.payload).toEqual({ currentStreak: 5, bestStreak: 5 });
  });

  it("incorrect guess resets currentStreak to 0 but preserves bestStreak", async () => {
    getScoreMock.mockResolvedValueOnce({ currentStreak: 5, bestStreak: 5, plays: 9 });

    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "score", sessionId: "s1", correct: false });

    expect(res.payload).toEqual({ currentStreak: 0, bestStreak: 5 });
    expect(putScoreMock).toHaveBeenCalledWith("s1", { currentStreak: 0, bestStreak: 5, plays: 10 });
  });

  it("missing sessionId returns 400 without touching DynamoDB", async () => {
    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "score", correct: true });

    expect(res.statusCode).toBe(400);
    expect(getScoreMock).not.toHaveBeenCalled();
  });

  it("non-boolean correct returns 400", async () => {
    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "score", sessionId: "s1", correct: "yes" });

    expect(res.statusCode).toBe(400);
  });
});

describe("gallery mode (Bedrock-independent)", () => {
  it("attaches thinaiData to each poem and passes the DynamoDB limit through unchanged", async () => {
    getRecentPoemsMock.mockResolvedValueOnce([
      { id: "1", situation: "s1", thinai: "kurinji", poem: "p1", reason: "r1", createdAt: "2026-08-14T00:00:00.000Z" },
      { id: "2", situation: "s2", thinai: "neithal", poem: "p2", reason: "r2", createdAt: "2026-08-13T00:00:00.000Z" },
    ]);

    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "gallery" });

    expect(res.statusCode).toBe(200);
    expect(getRecentPoemsMock).toHaveBeenCalledWith(20);
    const poems = res.payload.poems as Array<{ id: string; thinaiData: { landscape: string } }>;
    expect(poems).toHaveLength(2);
    expect(poems[0].thinaiData.landscape).toBe("Mountains");
    expect(poems[1].thinaiData.landscape).toBe("Seashore");
  });

  it("returns an empty array rather than erroring when no poems exist yet", async () => {
    getRecentPoemsMock.mockResolvedValueOnce([]);

    const handleRequest = await loadCore(false);
    const res = await handleRequest({ mode: "gallery" });

    expect(res.statusCode).toBe(200);
    expect(res.payload.poems).toEqual([]);
  });
});
