# Tinai Poet

A Sangam Tamil poetry engine, built for the AWS Builder Center Weekend Creative Challenge.


Classical Tamil poetics classifies every human situation into five *thinai* (landscapes). Each thinai has a fixed set of conventional images — flower, bird, time of day, deity, occupation — and the emotion is never stated directly, it is carried entirely by the landscape imagery.

Tinai Poet runs that convention forwards and backwards, off one shared knowledge base:

- **Create** — type a modern situation ("waiting on interview results"), the app classifies it into a thinai and writes a stanza using that landscape's imagery.
- **Play** — the app shows a stanza with the thinai hidden. Guess which of the five it is; the reveal names the specific image that gave it away. Streak counter, persisted per session.
- **Gallery** — the most recent poems written in Create, as a grid of cards tinted by landscape.
- **Today** — a fully autonomous fourth mode: once a day at 06:00 IST, an EventBridge-scheduled Lambda reads Madurai's real weather, maps it to a thinai by fixed code rules (not model judgement), and writes a new poem, never repeating the last week's imagery for that landscape. The Today tab shows today's poem, the weather reading that produced it, a one-line explanation of the mapping, and a 14-day archive. See "The daily agent" below.

## The non-negotiable design decision

The five thinai definitions ([`shared/thinai.js`](shared/thinai.js), duplicated into [`frontend/lib/thinai.ts`](frontend/lib/thinai.ts) — see [DECISIONS.md](DECISIONS.md) for why) are hardcoded data, not model knowledge. Bedrock is only ever allowed to (a) pick one of five fixed keys and (b) write English lines using the fields already present on that object. It is never asked to recall or invent a flower, deity, bird, or landscape association. That's the correctness guarantee the whole app rests on.

## Status: honest, not aspirational

The live app runs with **`USE_BEDROCK=true`** against a real, working AWS account — every poem is a live Amazon Nova Pro generation via the Bedrock Converse API, not the fallback. The classification, the stanza generation, the DynamoDB persistence, and the scoring are all real.

A hand-written deterministic fallback still exists (`lib/fallback.ts`) and is exercised by half the test suite — if `USE_BEDROCK` is ever set to anything but `"true"`, Create classifies by keyword match and both Create and Play serve from a small set of pre-written stanzas per landscape, chosen deterministically, with no Bedrock dependency at all. That was the app's original account's story (Bedrock blocked pending AWS account verification — see the migration section in [DECISIONS.md](DECISIONS.md)); it's kept in the code as a real, tested fallback path rather than deleted, since it's what makes the app demoable even if Bedrock access is ever revoked or rate-limited again.

Flipping between the two is a single environment variable — no code change, no redeploy logic.

The original AWS account's Amplify app, DynamoDB table, and IAM roles are still running as of this writing, deliberately left untouched pending confirmation this new deployment is good — they are not part of the live submission and will be torn down separately.

## Architecture

```
Next.js App Router (AWS Amplify Hosting, WEB_COMPUTE)
  ├─ app/page.tsx              tab shell (Create / Play / Gallery / Today), session UUID
  ├─ app/components/           CreateScreen, PlayScreen, GalleryScreen, TodayScreen, PoemCard
  └─ app/api/tinai/route.ts    single API route, mode-routed
        │
        ├─ Amazon Bedrock, Nova Pro Converse API   (apac.amazon.nova-pro-v1:0, ap-south-1)
        └─ Amazon DynamoDB, single table            (TinaiPoet: POEM#/SCORE#/DAILY# by PK, SK=META)

EventBridge Scheduler (cron 06:00 Asia/Kolkata, daily)
  └─ agent/index.ts (Lambda, nodejs22.x, invoked directly — no Function URL)
        ├─ Open-Meteo forecast API              (Madurai, no API key)
        ├─ agent/weatherThinai.ts               deterministic weather → thinai rules
        ├─ Amazon Bedrock, Nova Pro Converse API   (same model, separate role)
        └─ Amazon DynamoDB, same table            (writes DAILY#<date>, read by the app above)
```

The daily agent is a second, independent deploy unit — a plain Lambda zip, not part of the Next.js/Amplify build, with its own IAM role and its own copy of the thinai knowledge base (`agent/thinai.ts`; see "Duplication across deploy units" in DECISIONS.md). It writes to the same table the app reads from; the app never writes to `DAILY#` items.

No API Gateway, no Cognito, no auth — session identity is a UUID generated in the browser and held in React state only (no `localStorage`; a refresh starts a new session on purpose). Frontend and backend are one Next.js deployable on Amplify Hosting; there is deliberately no separate Lambda or Function URL (see the Amplify pivot in DECISIONS.md for why an earlier version of this architecture didn't work on the original AWS account).

Two IAM roles, both trusting only `amplify.amazonaws.com` — no static AWS keys anywhere in the app or its config. A build role with CodeCommit read + SSM read (Amplify stores its own env vars in Parameter Store and fetches them into the build container), and an SSR compute role with DynamoDB read/write scoped to the `TinaiPoet` table and `bedrock:InvokeModel`/`bedrock:Converse` scoped to `apac.amazon.nova-pro-v1:0`.

This app has been rebuilt once, in a second AWS account, after the account originally used for it was replaced. See "Account migration" in [DECISIONS.md](DECISIONS.md) for the full story, including two real Amplify Hosting platform bugs found and fixed in the process.

## Data model

Single DynamoDB table, `TinaiPoet`, keyed on `PK`/`SK`:

| PK | SK | Holds |
|---|---|---|
| `POEM#<uuid>` | `META` | situation, thinai, poem, reason, createdAt |
| `SCORE#<sessionId>` | `META` | currentStreak, bestStreak, plays |
| `DAILY#<date>` | `META` | thinai, rule, weather, poem, poemTamil, imagery, createdAt, `backfilled?` |

`DAILY#` items are written only by the agent Lambda (`agent/dynamo.ts`), never by the Next.js app. `backfilled: true` marks the 13 pre-launch days filled in by `agent/backfill.ts` from historical weather — see "The daily agent" below; every other `DAILY#` item is a real scheduled or manually-verified run.

## API contract

One route, `POST /api/tinai`, routed on `mode` in the JSON body. Every response is a shaped JSON object; the handler never throws to the caller.

- `{ mode: "create", situation }` → `{ poem, thinai, thinaiData, reason }`
- `{ mode: "play" }` → `{ poem, answer, giveaway }`
- `{ mode: "score", sessionId, correct }` → `{ currentStreak, bestStreak }`
- `{ mode: "gallery" }` → `{ poems: [...] }` (most recent 20)
- `{ mode: "today" }` → `{ today, archive: [...] }` (today's entry if it exists yet, plus the last 14 `DAILY#` entries, most recent first)

## Local development

```bash
cd frontend
npm install
USE_BEDROCK=false TABLE_NAME=TinaiPoet AWS_REGION=ap-south-1 npm run dev
```

AWS credentials for DynamoDB (and Bedrock, once `USE_BEDROCK=true`) are picked up from the default AWS CLI credential chain — no separate config needed if `aws configure` is already set up.

## Testing

```bash
cd frontend
npm test
```

18 tests (Vitest) covering both the real-Bedrock path (mocked) and the deterministic fallback path for every mode, run against the same core handler (`lib/tinaiCore.ts`) the deployed route uses.

## The daily agent

`agent/` is a separate deploy unit (Lambda zip, own `package.json`/`tsconfig.json`), invoked once a day by an EventBridge Scheduler rule — not a public Function URL, so it isn't exposed to the internet at all.

1. `weatherThinai.ts` fetches Madurai's real current weather from Open-Meteo (no API key) and maps it to a thinai through five ordered, deterministic rules — code, not model judgement, same "never invent, only select" guarantee the rest of the app rests on. Each rule's classical grounding is commented inline.
2. The last 7 days' imagery for that *same* thinai (not all thinai — see below) is pulled from DynamoDB as a "do not reuse" constraint.
3. Bedrock (Nova Pro) writes the bilingual stanza, gated by three independent, code-enforced, retry-once validators: no direct emotion word (mood leak), no other thinai's fixed flower/bird/deity (foreign-vocab leak), and this thinai's own flower and bird must actually be present in the Tamil text, verbatim (missing-required check — added after a run where the Tamil substituted an acoustically similar wrong word for the real one). A fourth concern — the stanza describing one consistent moment matching the thinai's canonical time of day — is prompt-only, deliberately not a fourth validator, so the model isn't optimizing against checks at the expense of the poem.
4. The result is written to `DAILY#<date>` with structured CloudWatch logging at every step (weather fetched, thinai chosen, imagery excluded, Bedrock latency, DynamoDB write confirmed) as the evidence trail for the autonomous run.

**A real bug worth knowing about:** an early version excluded imagery from the last 7 days regardless of which thinai each day was, on the theory that different thinai already have disjoint vocabularies so it couldn't matter. A real run disproved that — Bedrock treated an excluded *palai* day's imagery as available material and wove "palai flowers" and "vultures" into a *mullai* poem. Negative constraints in a prompt can read as a source list, not a blocklist. See the ADR in DECISIONS.md.

**Backfill:** `agent/backfill.ts` fills in real historical weather for the days before this feature existed, so the archive shows a full 14 days rather than one. It runs the exact same pipeline (same validators, same weather rules) against Open-Meteo's archive API, and never overwrites a real entry — every item it writes is flagged `backfilled: true` in the data and rendered with a visible "Backfilled, not scheduled" badge in the UI. Run it once, locally: `cd agent && npx tsc && node dist/backfill.js`.

## Deploying

**Frontend** — push to `main` on GitHub; Amplify Hosting auto-builds and deploys on push.

**Agent Lambda** — not part of the Amplify build. Compile and zip locally, then update the function directly:
```bash
cd agent
npx tsc
rm -rf package function.zip && mkdir package
cp dist/*.js package.json package/ && cp -r node_modules package/
(cd package && zip -r ../function.zip .)
aws lambda update-function-code --function-name TinaiPoetDailyAgent --zip-file fileb://function.zip
```

`USE_BEDROCK`, `TABLE_NAME`, and `BEDROCK_MODEL_ID` are set as Amplify app environment variables, but they only take effect via `next.config.ts`'s `env` block, which bakes them in at build time — Amplify Hosting's WEB_COMPUTE runtime does not forward them into the deployed Lambda's actual process environment (see DECISIONS.md). Changing any of these three requires a rebuild, not just an env var update.

## Further reading

[DECISIONS.md](DECISIONS.md) has the full build log of non-obvious choices — the Amplify pivot (and why), the AISPL account-verification wall, the fallback design, and a couple of real bugs hit and fixed along the way.
