import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { THINAI, THINAI_KEYS, ThinaiEntry, ThinaiKey } from "./thinai";

const REGION = process.env.AWS_REGION || "ap-south-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "apac.amazon.nova-pro-v1:0";

const bedrock = new BedrockRuntimeClient({ region: REGION });

interface CallNovaArgs {
  prompt: string;
  temperature: number;
  maxTokens: number;
  label: string;
}

// Converse API, not raw InvokeModel: same Nova Pro model, but a
// provider-agnostic request/response shape (no manual JSON body
// stringify/parse, no base64 decode) and it's the exact call verified
// working against this account (`aws bedrock-runtime converse ...`).
async function callNova({ prompt, temperature, maxTokens, label }: CallNovaArgs): Promise<string> {
  const started = Date.now();
  const command = new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { temperature, maxTokens },
  });
  const response = await bedrock.send(command);
  const latencyMs = Date.now() - started;
  console.log(JSON.stringify({ event: "bedrock_latency", call: label, ms: latencyMs }));

  const text = response.output?.message?.content?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`Bedrock call "${label}" returned no text content`);
  }
  return text;
}

function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildClassifyPrompt(situation: string): string {
  const options = THINAI_KEYS.map((key) => {
    const t = THINAI[key];
    return `- "${key}": ${t.landscape} — ${t.mood}`;
  }).join("\n");

  return `You are classifying a modern situation into one of five classical Tamil Sangam "thinai" (poetic landscapes). Choose exactly one key from this fixed list — do not invent a new one:

${options}

Situation: "${situation}"

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"thinai": "<one of: ${THINAI_KEYS.join(", ")}>", "reason": "<one sentence on why this landscape fits the situation's emotional shape>"}`;
}

export async function classifyThinai(situation: string): Promise<{ thinai: ThinaiKey; reason: string }> {
  const prompt = buildClassifyPrompt(situation);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await callNova({
      prompt:
        attempt === 1
          ? prompt
          : `${prompt}\n\nYour previous answer was not one of the five valid keys. Answer again, using exactly one of: ${THINAI_KEYS.join(", ")}.`,
      temperature: 0.2,
      maxTokens: 200,
      label: `classify_attempt${attempt}`,
    });
    try {
      const parsedJson = extractJsonBlock(raw) as { thinai?: string; reason?: string };
      if (parsedJson.thinai && (THINAI_KEYS as readonly string[]).includes(parsedJson.thinai)) {
        return { thinai: parsedJson.thinai as ThinaiKey, reason: parsedJson.reason || "" };
      }
    } catch {
      // fall through to retry
    }
  }
  throw new Error("Bedrock did not return a valid thinai after retry");
}

// Per-thinai words that would name the emotion outright, in both
// languages the model might leak it in. Tamil entries reuse the
// classical terms already in thinai.ts (ūdal, pirivu) where they exist,
// since those ARE the mood-naming word in Tamil for that thinai.
const MOOD_WORDS: Record<ThinaiKey, { english: string[]; tamil: string[] }> = {
  kurinji: { english: ["union", "love"], tamil: ["காதல்", "கூடல்"] },
  mullai: { english: ["waiting", "patience", "patient"], tamil: ["காத்திருப்பு", "பொறுமை"] },
  marutham: { english: ["estrangement", "jealousy", "quarrel"], tamil: ["ஊடல்"] },
  neithal: { english: ["anxious", "anxiety", "longing", "worry", "worried"], tamil: ["ஏக்கம்", "கவலை"] },
  palai: { english: ["separation", "parting", "loneliness", "lonely"], tamil: ["பிரிவு", "தனிமை"] },
};

function findLeakedWord(text: string, words: string[]): string | null {
  const lower = text.toLowerCase();
  for (const word of words) {
    if (lower.includes(word.toLowerCase())) return word;
  }
  return null;
}

function buildStanzaPrompt(situation: string, thinaiData: ThinaiEntry): string {
  return `Write a 4 to 6 line stanza in the classical Tamil Sangam "akam" tradition, set entirely in the ${thinaiData.landscape} landscape. Write it TWICE — once in Tamil (Tamil script), once in English — as two versions of the same stanza.

Use ONLY these landscape images, drawn from the fixed conventions of this thinai — do not introduce any other flowers, deities, animals, or landscape elements of your own invention:
- Terrain: ${thinaiData.terrain}
- Flower: ${thinaiData.flower}
- Bird: ${thinaiData.bird}
- Time of day: ${thinaiData.timeOfDay}
- Occupation of the people who live here: ${thinaiData.occupation}

The underlying situation the poem is inspired by: "${situation}"

CRITICAL RULE (English): Never name the emotion directly. Do not use words like "waiting", "lonely", "happy", "anxious", "love", "miss", "union", "separation", "longing", "jealousy" — or their Tamil equivalents. Let the landscape imagery alone carry the feeling.

முக்கிய விதி (தமிழ்): உணர்ச்சியை நேரடியாகப் பெயரிடாதீர்கள். "காத்திருப்பு", "தனிமை", "காதல்", "பிரிவு", "ஏக்கம்", "ஊடல்" போன்ற சொற்களைப் பயன்படுத்த வேண்டாம். இயற்கைக் காட்சிகள் மட்டுமே உணர்வை உணர்த்தட்டும்.

Example of a GOOD line (imagery only, emotion never named): "The lamp is lit before it is needed, in case tonight is different."
Example of a LEAKING line — do NOT write like this (names the emotion directly): "I wait here, lonely, missing you every night."

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"tamil": "<the Tamil stanza, Tamil script, lines separated by \\n>", "english": "<the English stanza, lines separated by \\n>"}`;
}

export interface Stanza {
  english: string;
  tamil: string;
}

export async function writeStanza(situation: string, thinaiData: ThinaiEntry, thinaiKey: ThinaiKey): Promise<Stanza> {
  const prompt = buildStanzaPrompt(situation, thinaiData);
  const bannedWords = MOOD_WORDS[thinaiKey];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await callNova({
      prompt:
        attempt === 1
          ? prompt
          : `${prompt}\n\nYour previous attempt named the emotion directly, in violation of the rule above. Rewrite both versions using only landscape imagery — no emotion word, in either language.`,
      temperature: 0.8,
      maxTokens: 500,
      label: `write_stanza_attempt${attempt}`,
    });
    try {
      const parsed = extractJsonBlock(raw) as { tamil?: string; english?: string };
      if (typeof parsed.tamil !== "string" || typeof parsed.english !== "string") {
        continue;
      }
      const leak = findLeakedWord(parsed.english, bannedWords.english) || findLeakedWord(parsed.tamil, bannedWords.tamil);
      if (!leak) {
        return { english: parsed.english.trim(), tamil: parsed.tamil.trim() };
      }
    } catch {
      // fall through to retry
    }
  }
  throw new Error("Bedrock named the emotion directly after retry");
}
