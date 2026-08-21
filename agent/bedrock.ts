import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { THINAI, THINAI_KEYS } from "./thinai";
import type { ThinaiEntry, ThinaiKey } from "./thinai";
import type { WeatherReading } from "./weatherThinai";

const REGION = process.env.AWS_REGION || "ap-south-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "apac.amazon.nova-pro-v1:0";

const bedrock = new BedrockRuntimeClient({ region: REGION });

interface CallNovaArgs {
  prompt: string;
  temperature: number;
  maxTokens: number;
  label: string;
}

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

// Same per-thinai mood words as frontend/lib/bedrock.ts — kept in sync
// by hand (see DECISIONS.md on duplication across deploy units).
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

// Each thinai's own fixed flower/bird/deity terms, keyed by the thinai
// they belong to. Used to catch a stanza importing another landscape's
// named vocabulary — the "never invent, only select" guarantee applies
// just as much to which thinai's images appear as to inventing new ones.
// Flower/bird Tamil terms are pulled from thinai.ts (the single source
// for those) rather than hand-copied a second time; only the English
// short forms and deity names — not structured fields on ThinaiEntry —
// stay hand-maintained here, same as MOOD_WORDS above (see DECISIONS.md).
const FOREIGN_VOCAB_EXTRA: Record<ThinaiKey, { english: string[]; tamil: string[] }> = {
  kurinji: { english: ["kurinji flower", "murugan", "seyon"], tamil: ["முருகன்", "சேயோன்"] },
  mullai: { english: ["jasmine", "mayon"], tamil: ["மாயோன்"] },
  marutham: { english: ["marutham flower", "indiran", "ventan"], tamil: ["இந்திரன்", "வெந்தன்"] },
  neithal: { english: ["neithal", "water-lily", "varunan", "kadalon"], tamil: ["வருணன்", "கடலோன்"] },
  palai: { english: ["palai flower", "korravai"], tamil: ["கொற்றவை"] },
};

function foreignVocabFor(key: ThinaiKey): { english: string[]; tamil: string[] } {
  const entry = THINAI[key];
  const extra = FOREIGN_VOCAB_EXTRA[key];
  return {
    english: [...extra.english, entry.bird.split(" ")[0]],
    tamil: [entry.flowerTamil, entry.birdTamil, ...extra.tamil],
  };
}

// Checks a stanza against every OTHER thinai's fixed vocabulary — not
// this one's, which is expected to appear.
function findForeignVocabLeak(english: string, tamil: string, thinaiKey: ThinaiKey): string | null {
  for (const key of THINAI_KEYS) {
    if (key === thinaiKey) continue;
    const vocab = foreignVocabFor(key);
    const leak = findLeakedWord(english, vocab.english) || findLeakedWord(tamil, vocab.tamil);
    if (leak) return `${leak} (${key})`;
  }
  return null;
}

// Positive check, the counterpart to findForeignVocabLeak above: not just
// "no other thinai's flower/bird," but "THIS thinai's own flower and bird
// are actually present." Added after a real run where the English stanza
// correctly used jasmine/koel but the Tamil stanza substituted acoustically
// similar wrong words (கோயில்/கோவில் "temple" for முல்லை/குயில்
// "jasmine"/"koel") — the model produced fluent, plausible-looking Tamil
// that simply wasn't the required vocabulary. Checked against thinai.ts's
// canonical Tamil terms, the same ones now given directly in the prompt.
function findMissingRequiredTamil(tamil: string, thinaiData: ThinaiEntry): string | null {
  const missing: string[] = [];
  if (!tamil.includes(thinaiData.flowerTamil)) missing.push(`flower (${thinaiData.flowerTamil})`);
  if (!tamil.includes(thinaiData.birdTamil)) missing.push(`bird (${thinaiData.birdTamil})`);
  return missing.length > 0 ? missing.join(", ") : null;
}

function describeWeather(w: WeatherReading): string {
  const parts = [`${w.temperature}°C`, `${w.humidity}% humidity`];
  if (w.precipitation > 0) parts.push(`${w.precipitation}mm rain`);
  parts.push(`${w.cloudCover}% cloud cover`, `${w.windSpeed} km/h wind`);
  return parts.join(", ");
}

function buildDailyStanzaPrompt(thinaiData: ThinaiEntry, weather: WeatherReading, recentImagery: string[]): string {
  const exclusion =
    recentImagery.length > 0
      ? `\nDo NOT reuse any of these specific images or phrasings — they were already used in this landscape's poems over the last 7 days, and today's poem needs its own images within the fixed vocabulary below:\n${recentImagery.map((i) => `- ${i}`).join("\n")}\n`
      : "";

  return `Write a 4 to 6 line stanza in the classical Tamil Sangam "akam" tradition, set entirely in the ${thinaiData.landscape} landscape. Write it TWICE — once in Tamil (Tamil script), once in English — as two versions of the same stanza.

This is today's poem, generated from a real weather reading for Madurai: ${describeWeather(weather)}.

Use ONLY these landscape images, drawn from the fixed conventions of this thinai — do not introduce any other flowers, deities, animals, or landscape elements of your own invention:
- Terrain: ${thinaiData.terrain}
- Flower: ${thinaiData.flower}
- Bird: ${thinaiData.bird}
- Time of day: ${thinaiData.timeOfDay}
- Occupation of the people who live here: ${thinaiData.occupation}

The stanza must describe a SINGLE consistent moment in time — do not mix times of day within the same stanza (e.g. do not open at evening and then describe morning, or vice versa). That moment must be this thinai's canonical time of day: ${thinaiData.timeOfDay}. Every line should belong to that one moment.

For the TAMIL version specifically, you MUST use these exact Tamil words verbatim — do not translate, paraphrase, or substitute a different word, even one that sounds similar:
- Flower (தமிழில்): ${thinaiData.flowerTamil}
- Bird (தமிழில்): ${thinaiData.birdTamil}
Do not confuse these with unrelated similar-sounding Tamil words (for example, ${thinaiData.birdTamil} must not become கோவில்/கோயில் "temple" — a different word that only sounds alike).
${exclusion}
CRITICAL RULE (English): Never name the emotion directly. Do not use words like "waiting", "lonely", "happy", "anxious", "love", "miss", "union", "separation", "longing", "jealousy" — or their Tamil equivalents. Let the landscape imagery alone carry the feeling.

முக்கிய விதி (தமிழ்): உணர்ச்சியை நேரடியாகப் பெயரிடாதீர்கள். "காத்திருப்பு", "தனிமை", "காதல்", "பிரிவு", "ஏக்கம்", "ஊடல்" போன்ற சொற்களைப் பயன்படுத்த வேண்டாம். இயற்கைக் காட்சிகள் மட்டுமே உணர்வை உணர்த்தட்டும்.

Example of a GOOD line (imagery only, emotion never named): "The lamp is lit before it is needed, in case tonight is different."
Example of a LEAKING line — do NOT write like this (names the emotion directly): "I wait here, lonely, missing you every night."

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"tamil": "<the Tamil stanza, Tamil script, lines separated by \\n>", "english": "<the English stanza, lines separated by \\n>", "imagery": ["<2 to 4 short phrases naming the specific images/metaphors this stanza used, e.g. 'peacock's cry in the dark', 'waterfall unlistening'>"]}`;
}

export interface DailyStanza {
  english: string;
  tamil: string;
  imagery: string[];
}

export async function writeDailyStanza(
  thinaiData: ThinaiEntry,
  thinaiKey: ThinaiKey,
  weather: WeatherReading,
  recentImagery: string[]
): Promise<DailyStanza> {
  const prompt = buildDailyStanzaPrompt(thinaiData, weather, recentImagery);
  const bannedWords = MOOD_WORDS[thinaiKey];

  let lastFailure: "mood" | "vocab" | "missing" | null = null;
  let lastLeak = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let retryNote = "";
    if (attempt === 2) {
      if (lastFailure === "vocab") {
        retryNote = `\n\nYour previous attempt used "${lastLeak}", which belongs to a DIFFERENT thinai, not ${thinaiData.landscape}. Rewrite both versions using ONLY the fixed vocabulary listed above (this thinai's own terrain, flower, bird, time of day) — do not reference any other landscape's flower, bird, or deity, even one that appeared earlier in this prompt as something to avoid repeating.`;
      } else if (lastFailure === "missing") {
        retryNote = `\n\nYour previous Tamil version was missing required vocabulary: ${lastLeak}. The Tamil stanza must literally contain the word "${thinaiData.flowerTamil}" (flower) and the word "${thinaiData.birdTamil}" (bird), verbatim, not a paraphrase or a similar-sounding substitute. Rewrite the Tamil version so both appear.`;
      } else {
        retryNote = `\n\nYour previous attempt named the emotion directly, in violation of the rule above. Rewrite both versions using only landscape imagery — no emotion word, in either language.`;
      }
    }

    const raw = await callNova({
      prompt: prompt + retryNote,
      temperature: 0.8,
      maxTokens: 600,
      label: `daily_stanza_attempt${attempt}`,
    });
    try {
      const parsed = extractJsonBlock(raw) as { tamil?: string; english?: string; imagery?: unknown };
      if (typeof parsed.tamil !== "string" || typeof parsed.english !== "string" || !Array.isArray(parsed.imagery)) {
        continue;
      }
      const moodLeak = findLeakedWord(parsed.english, bannedWords.english) || findLeakedWord(parsed.tamil, bannedWords.tamil);
      if (moodLeak) {
        lastFailure = "mood";
        lastLeak = moodLeak;
        continue;
      }
      const vocabLeak = findForeignVocabLeak(parsed.english, parsed.tamil, thinaiKey);
      if (vocabLeak) {
        lastFailure = "vocab";
        lastLeak = vocabLeak;
        continue;
      }
      const missingRequired = findMissingRequiredTamil(parsed.tamil, thinaiData);
      if (missingRequired) {
        lastFailure = "missing";
        lastLeak = missingRequired;
        continue;
      }
      return {
        english: parsed.english.trim(),
        tamil: parsed.tamil.trim(),
        imagery: parsed.imagery.filter((x): x is string => typeof x === "string"),
      };
    } catch {
      // fall through to retry
    }
  }
  if (lastFailure === "vocab") {
    throw new Error(`Bedrock imported another thinai's fixed vocabulary ("${lastLeak}") after retry`);
  }
  if (lastFailure === "missing") {
    throw new Error(`Bedrock's Tamil stanza is missing required vocabulary (${lastLeak}) after retry`);
  }
  throw new Error("Bedrock named the emotion directly after retry");
}
