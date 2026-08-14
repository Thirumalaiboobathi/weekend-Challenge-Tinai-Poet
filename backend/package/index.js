const { randomUUID } = require("node:crypto");
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { THINAI, THINAI_KEYS } = require("./thinai");

const REGION = process.env.AWS_REGION || "ap-south-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "apac.amazon.nova-pro-v1:0";
const TABLE_NAME = process.env.TABLE_NAME || "TinaiPoet";
const MAX_SITUATION_LENGTH = 400;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const bedrock = new BedrockRuntimeClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function respond(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify(payload),
  };
}

function errorResponse(statusCode, message) {
  return respond(statusCode, { error: true, message });
}

async function callNova({ prompt, temperature, maxTokens, label }) {
  const started = Date.now();
  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { temperature, maxTokens },
    }),
  });
  const response = await bedrock.send(command);
  const latencyMs = Date.now() - started;
  console.log(JSON.stringify({ event: "bedrock_latency", call: label, ms: latencyMs }));

  const parsed = JSON.parse(Buffer.from(response.body).toString("utf-8"));
  const text = parsed?.output?.message?.content?.[0]?.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`Bedrock call "${label}" returned no text content`);
  }
  return text;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildClassifyPrompt(situation) {
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

function buildStanzaPrompt(situation, thinaiData) {
  return `Write a 4 to 6 line English poem stanza in the classical Tamil Sangam "akam" tradition, set entirely in the ${thinaiData.landscape} landscape.

Use ONLY these landscape images, drawn from the fixed conventions of this thinai — do not introduce any other flowers, deities, animals, or landscape elements of your own invention:
- Terrain: ${thinaiData.terrain}
- Flower: ${thinaiData.flower}
- Bird: ${thinaiData.bird}
- Time of day: ${thinaiData.timeOfDay}
- Occupation of the people who live here: ${thinaiData.occupation}

The underlying situation the poem is inspired by: "${situation}"

Rules:
- Do not name the emotion directly (no words like "waiting", "lonely", "happy", "anxious", "love", "miss").
- Let the landscape imagery alone carry the feeling.
- Output ONLY the stanza itself, as plain text lines. No title, no JSON, no explanation, no quotation marks around it.`;
}

async function classifyThinai(situation) {
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
      const parsedJson = extractJson(raw);
      if (THINAI_KEYS.includes(parsedJson.thinai)) {
        return { thinai: parsedJson.thinai, reason: parsedJson.reason || "" };
      }
    } catch {
      // fall through to retry
    }
  }
  throw new Error("Bedrock did not return a valid thinai after retry");
}

async function writeStanza(situation, thinaiData) {
  const prompt = buildStanzaPrompt(situation, thinaiData);
  const raw = await callNova({
    prompt,
    temperature: 0.8,
    maxTokens: 300,
    label: "write_stanza",
  });
  return raw.trim();
}

async function handleCreate(body) {
  const situation = typeof body.situation === "string" ? body.situation.trim() : "";
  if (!situation) {
    return errorResponse(400, "situation is required");
  }
  if (situation.length > MAX_SITUATION_LENGTH) {
    return errorResponse(400, `situation must be ${MAX_SITUATION_LENGTH} characters or fewer`);
  }

  const { thinai, reason } = await classifyThinai(situation);
  const thinaiData = THINAI[thinai];
  const poem = await writeStanza(situation, thinaiData);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `POEM#${id}`,
        SK: "META",
        id,
        situation,
        thinai,
        poem,
        reason,
        createdAt,
      },
    })
  );

  return respond(200, { poem, thinai, thinaiData, reason });
}

exports.handler = async (event) => {
  try {
    const method = event?.requestContext?.http?.method || "POST";
    if (method === "OPTIONS") {
      return respond(200, {});
    }

    let body;
    try {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64").toString("utf-8")
        : event.body || "{}";
      body = JSON.parse(raw);
    } catch {
      return errorResponse(400, "invalid JSON body");
    }

    switch (body.mode) {
      case "create":
        return await handleCreate(body);
      default:
        return errorResponse(400, `mode "${body.mode}" is not implemented yet`);
    }
  } catch (err) {
    console.error(JSON.stringify({ event: "handler_error", message: err?.message, stack: err?.stack }));
    return errorResponse(502, "something went wrong generating your poem, please try again");
  }
};
