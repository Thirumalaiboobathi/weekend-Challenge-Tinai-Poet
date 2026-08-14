# Tinai Poet

A Sangam Tamil poetry engine, built for the AWS Builder Center Weekend Creative Challenge.

**Live:** https://master.d32feklve3ga6y.amplifyapp.com/

Classical Tamil poetics classifies every human situation into five *thinai* (landscapes). Each thinai has a fixed set of conventional images — flower, bird, time of day, deity, occupation — and the emotion is never stated directly, it is carried entirely by the landscape imagery.

Tinai Poet runs that convention forwards and backwards, off one shared knowledge base:

- **Create** — type a modern situation ("waiting on interview results"), the app classifies it into a thinai and writes a stanza using that landscape's imagery.
- **Play** — the app shows a stanza with the thinai hidden. Guess which of the five it is; the reveal names the specific image that gave it away. Streak counter, persisted per session.
- **Gallery** — the most recent poems written in Create, as a grid of cards tinted by landscape.

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
  ├─ app/page.tsx              tab shell (Create / Play / Gallery), session UUID
  ├─ app/components/           CreateScreen, PlayScreen, GalleryScreen, PoemCard
  └─ app/api/tinai/route.ts    single API route, mode-routed
        │
        ├─ Amazon Bedrock, Nova Pro Converse API   (apac.amazon.nova-pro-v1:0, ap-south-1)
        └─ Amazon DynamoDB, single table            (TinaiPoet: POEM#/SCORE# by PK, SK=META)
```

No API Gateway, no Cognito, no auth — session identity is a UUID generated in the browser and held in React state only (no `localStorage`; a refresh starts a new session on purpose). Frontend and backend are one Next.js deployable on Amplify Hosting; there is deliberately no separate Lambda or Function URL (see the Amplify pivot in DECISIONS.md for why an earlier version of this architecture didn't work on the original AWS account).

Two IAM roles, both trusting only `amplify.amazonaws.com` — no static AWS keys anywhere in the app or its config. A build role with CodeCommit read + SSM read (Amplify stores its own env vars in Parameter Store and fetches them into the build container), and an SSR compute role with DynamoDB read/write scoped to the `TinaiPoet` table and `bedrock:InvokeModel`/`bedrock:Converse` scoped to `apac.amazon.nova-pro-v1:0`.

This app has been rebuilt once, in a second AWS account, after the account originally used for it was replaced. See "Account migration" in [DECISIONS.md](DECISIONS.md) for the full story, including two real Amplify Hosting platform bugs found and fixed in the process.

## Data model

Single DynamoDB table, `TinaiPoet`, keyed on `PK`/`SK`:

| PK | SK | Holds |
|---|---|---|
| `POEM#<uuid>` | `META` | situation, thinai, poem, reason, createdAt |
| `SCORE#<sessionId>` | `META` | currentStreak, bestStreak, plays |

## API contract

One route, `POST /api/tinai`, routed on `mode` in the JSON body. Every response is a shaped JSON object; the handler never throws to the caller.

- `{ mode: "create", situation }` → `{ poem, thinai, thinaiData, reason }`
- `{ mode: "play" }` → `{ poem, answer, giveaway }`
- `{ mode: "score", sessionId, correct }` → `{ currentStreak, bestStreak }`
- `{ mode: "gallery" }` → `{ poems: [...] }` (most recent 20)

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

## Deploying

Push to the `master` branch of the CodeCommit repo (`tinai-poet`, `ap-south-1`, in the same AWS account as the live app) — Amplify Hosting auto-builds and deploys on push. No GitHub involved; see DECISIONS.md for why CodeCommit was used instead.

`USE_BEDROCK`, `TABLE_NAME`, and `BEDROCK_MODEL_ID` are set as Amplify app environment variables, but they only take effect via `next.config.ts`'s `env` block, which bakes them in at build time — Amplify Hosting's WEB_COMPUTE runtime does not forward them into the deployed Lambda's actual process environment (see DECISIONS.md). Changing any of these three requires a rebuild, not just an env var update.

## Further reading

[DECISIONS.md](DECISIONS.md) has the full build log of non-obvious choices — the Amplify pivot (and why), the AISPL account-verification wall, the fallback design, and a couple of real bugs hit and fixed along the way.
