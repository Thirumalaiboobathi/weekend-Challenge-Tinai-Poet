// Transport-agnostic core — ported from the original standalone Lambda
// handler (backend/index.js). Same mode routing, same two-Bedrock-call
// create flow, same DynamoDB single-table access, same never-throw
// invariant, same shaped errors. Only the outer transport adapter
// changed (Lambda event/response -> Next.js Request/Response), which is
// why this file takes and returns plain objects rather than an HTTP
// Request itself — see app/api/tinai/route.ts for that adapter.

import { randomUUID } from "node:crypto";
import { THINAI, ThinaiKey } from "./thinai";
import { classifyThinai, writeStanza } from "./bedrock";
import { putPoem, getScore, putScore, getRecentPoems } from "./dynamo";
import {
  classifyThinaiFallback,
  writeStanzaFallback,
  pickRandomSeed,
  stanzaForSeedSituation,
  pickGiveaway,
} from "./fallback";

const MAX_SITUATION_LENGTH = 400;
const GALLERY_LIMIT = 20;
const USE_BEDROCK = process.env.USE_BEDROCK === "true";

export interface ShapedResponse {
  statusCode: number;
  payload: Record<string, unknown>;
}

function errorResponse(statusCode: number, message: string): ShapedResponse {
  return { statusCode, payload: { error: true, message } };
}

async function handleCreate(body: Record<string, unknown>): Promise<ShapedResponse> {
  const situation = typeof body.situation === "string" ? body.situation.trim() : "";
  if (!situation) {
    return errorResponse(400, "situation is required");
  }
  if (situation.length > MAX_SITUATION_LENGTH) {
    return errorResponse(400, `situation must be ${MAX_SITUATION_LENGTH} characters or fewer`);
  }

  const { thinai, reason } = USE_BEDROCK
    ? await classifyThinai(situation)
    : classifyThinaiFallback(situation);
  const thinaiData = THINAI[thinai];
  const { poem, poemTamil } = USE_BEDROCK
    ? await writeStanza(situation, thinaiData, thinai as ThinaiKey).then((s) => ({ poem: s.english, poemTamil: s.tamil }))
    : { poem: writeStanzaFallback(situation, thinai as ThinaiKey), poemTamil: undefined };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await putPoem({ id, situation, thinai, poem, poemTamil, reason, createdAt });

  return { statusCode: 200, payload: { poem, poemTamil, thinai, thinaiData, reason } };
}

async function handlePlay(): Promise<ShapedResponse> {
  const { situation, thinai } = pickRandomSeed();
  const thinaiData = THINAI[thinai];
  const { poem, poemTamil } = USE_BEDROCK
    ? await writeStanza(situation, thinaiData, thinai).then((s) => ({ poem: s.english, poemTamil: s.tamil }))
    : { poem: stanzaForSeedSituation(situation, thinai), poemTamil: undefined };
  const giveaway = pickGiveaway(thinaiData);

  return { statusCode: 200, payload: { poem, poemTamil, answer: thinai, giveaway } };
}

async function handleScore(body: Record<string, unknown>): Promise<ShapedResponse> {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return errorResponse(400, "sessionId is required");
  }
  if (typeof body.correct !== "boolean") {
    return errorResponse(400, "correct must be a boolean");
  }

  const existing = await getScore(sessionId);
  const plays = (existing?.plays ?? 0) + 1;
  const currentStreak = body.correct ? (existing?.currentStreak ?? 0) + 1 : 0;
  const bestStreak = Math.max(existing?.bestStreak ?? 0, currentStreak);

  await putScore(sessionId, { currentStreak, bestStreak, plays });

  return { statusCode: 200, payload: { currentStreak, bestStreak } };
}

async function handleGallery(): Promise<ShapedResponse> {
  const recent = await getRecentPoems(GALLERY_LIMIT);
  const poems = recent.map((p) => ({ ...p, thinaiData: THINAI[p.thinai] }));
  return { statusCode: 200, payload: { poems } };
}

export async function handleRequest(body: Record<string, unknown>): Promise<ShapedResponse> {
  try {
    switch (body.mode) {
      case "create":
        return await handleCreate(body);
      case "play":
        return await handlePlay();
      case "score":
        return await handleScore(body);
      case "gallery":
        return await handleGallery();
      default:
        return errorResponse(400, `mode "${body.mode as string}" is not implemented yet`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: "handler_error", message }));
    return errorResponse(502, "something went wrong generating your poem, please try again");
  }
}
