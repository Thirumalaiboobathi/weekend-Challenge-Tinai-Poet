// Local test harness — mocks the AWS SDK `send` calls so the handler's
// logic (prompt building, JSON extraction, retry, DynamoDB write shape,
// error handling) can be verified without live Bedrock model access.
// Does NOT prove Bedrock itself is invocable — Phase 0 covers that
// separately and is still blocked on the console model-access form.

const assert = require("node:assert");
const { BedrockRuntimeClient } = require("@aws-sdk/client-bedrock-runtime");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

function novaResponse(text) {
  const body = JSON.stringify({ output: { message: { content: [{ text }] } } });
  return { body: Buffer.from(body, "utf-8") };
}

let bedrockCallLog = [];
let ddbPutItems = [];

function installMocks({ classifyText, classifyText2, stanzaText }) {
  bedrockCallLog = [];
  ddbPutItems = [];
  let callCount = 0;

  BedrockRuntimeClient.prototype.send = async (command) => {
    callCount += 1;
    const parsedBody = JSON.parse(command.input.body);
    const prompt = parsedBody.messages[0].content[0].text;
    bedrockCallLog.push({ callCount, temperature: parsedBody.inferenceConfig.temperature, prompt });

    if (prompt.includes("Write a 4 to 6 line")) {
      return novaResponse(stanzaText);
    }
    if (callCount === 1) {
      return novaResponse(classifyText);
    }
    return novaResponse(classifyText2 ?? classifyText);
  };

  DynamoDBDocumentClient.prototype.send = async (command) => {
    ddbPutItems.push(command.input.Item);
    return {};
  };
}

function makeEvent(body) {
  return {
    requestContext: { http: { method: "POST" } },
    body: JSON.stringify(body),
  };
}

async function run() {
  delete require.cache[require.resolve("./index")];

  // --- Case 1: happy path, valid classify JSON first try ---
  installMocks({
    classifyText: '```json\n{"thinai": "neithal", "reason": "the anxious uncertainty of waiting for news fits neithal\'s pining by the shore"}\n```',
    stanzaText:
      "The gulls circle low where the tide has not yet turned,\nboats still out past the sandbar at sunset,\nneithal petals close early on the darkening water,\nand still the shore keeps its watch, unanswered.",
  });
  const { handler } = require("./index");

  const res1 = await handler(makeEvent({ mode: "create", situation: "Waiting to hear back after a job interview" }));
  assert.strictEqual(res1.statusCode, 200, "expected 200 on happy path");
  const parsed1 = JSON.parse(res1.body);
  assert.strictEqual(parsed1.thinai, "neithal");
  assert.ok(parsed1.poem.length > 0, "poem should not be empty");
  assert.ok(parsed1.thinaiData.flower.includes("Neithal") || parsed1.thinaiData.flower.includes("water-lily"));
  assert.strictEqual(ddbPutItems.length, 1, "expected exactly one DynamoDB put");
  assert.strictEqual(ddbPutItems[0].thinai, "neithal");
  assert.strictEqual(ddbPutItems[0].SK, "META");
  assert.ok(ddbPutItems[0].PK.startsWith("POEM#"));
  assert.strictEqual(bedrockCallLog[0].temperature, 0.2, "classify call should use temperature 0.2");
  assert.strictEqual(bedrockCallLog[1].temperature, 0.8, "stanza call should use temperature 0.8");
  console.log("PASS: happy path create returns shaped poem + persists to DynamoDB");

  // --- Case 2: classify returns invalid thinai first, valid on retry ---
  installMocks({
    classifyText: '{"thinai": "desert", "reason": "wrong key"}',
    classifyText2: '{"thinai": "palai", "reason": "the hardship of the long commute fits palai"}',
    stanzaText: "The path shimmers white at noon,\na vulture rides the heat above the thorn scrub,\nno shade, no water, the wasteland does not answer,\nonly the cracked earth holding the shape of a road.",
  });
  delete require.cache[require.resolve("./index")];
  const { handler: handler2 } = require("./index");
  const res2 = await handler2(makeEvent({ mode: "create", situation: "A long, exhausting commute during a heatwave" }));
  assert.strictEqual(res2.statusCode, 200, "expected 200 after successful retry");
  const parsed2 = JSON.parse(res2.body);
  assert.strictEqual(parsed2.thinai, "palai");
  assert.strictEqual(bedrockCallLog.length, 3, "expected 3 bedrock calls: invalid classify, retry classify, then stanza write");
  console.log("PASS: invalid thinai on first attempt retries once and recovers");

  // --- Case 3: classify invalid twice -> shaped error, never throws ---
  installMocks({
    classifyText: '{"thinai": "ocean", "reason": "still wrong"}',
    classifyText2: '{"thinai": "space", "reason": "still wrong again"}',
    stanzaText: "unused",
  });
  delete require.cache[require.resolve("./index")];
  const { handler: handler3 } = require("./index");
  const res3 = await handler3(makeEvent({ mode: "create", situation: "Some situation" }));
  assert.strictEqual(res3.statusCode, 502);
  const parsed3 = JSON.parse(res3.body);
  assert.strictEqual(parsed3.error, true);
  console.log("PASS: two invalid classify attempts returns shaped 502 error, does not throw");

  // --- Case 4: empty situation -> 400 shaped error, no Bedrock calls ---
  installMocks({ classifyText: "{}", stanzaText: "unused" });
  delete require.cache[require.resolve("./index")];
  const { handler: handler4 } = require("./index");
  const res4 = await handler4(makeEvent({ mode: "create", situation: "   " }));
  assert.strictEqual(res4.statusCode, 400);
  assert.strictEqual(bedrockCallLog.length, 0, "should not call Bedrock for invalid input");
  console.log("PASS: empty situation returns 400 without calling Bedrock");

  // --- Case 5: unknown mode -> 400 shaped error ---
  const res5 = await handler4(makeEvent({ mode: "play" }));
  assert.strictEqual(res5.statusCode, 400);
  console.log("PASS: unimplemented mode returns shaped 400, not a throw");

  console.log("\nAll local tests passed.");
}

run().catch((err) => {
  console.error("LOCAL TEST FAILURE:", err);
  process.exit(1);
});
