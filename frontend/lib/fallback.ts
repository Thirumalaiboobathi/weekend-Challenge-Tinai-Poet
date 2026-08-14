// Deterministic fallback path — used when USE_BEDROCK is not "true".
//
// Create mode classifies by keyword matching against hand-picked terms
// per thinai (still selecting an index into THINAI, never inventing a
// landscape) and returns one of three pre-written stanzas per thinai.
// Play mode reuses the same stanza pool, mapped 1:1 to the seed
// situations so every seed situation always renders the same stanza.
//
// This keeps the whole app demoable with zero Bedrock dependency, and
// upgrading to real generation later is just USE_BEDROCK=true.

import { SEED_SITUATIONS, THINAI, THINAI_KEYS, ThinaiEntry, ThinaiKey } from "./thinai";

const KEYWORDS: Record<ThinaiKey, string[]> = {
  kurinji: [
    "date", "crush", "confess", "confession", "first met", "first time",
    "new love", "falling for", "asked out", "propose", "proposal",
    "reunite", "reunion", "reconnect", "childhood friend", "spark", "butterflies",
    "tell them how i feel", "how i feel about",
  ],
  mullai: [
    "long distance", "abroad", "deployed", "deployment", "military",
    "waiting for", "video call", "miss him", "miss her", "away from",
    "working away", "overseas", "faithful", "patient", "holidays",
    "ship", "return home", "come home", "come back",
  ],
  marutham: [
    "fight", "argument", "argued", "bicker", "quarrel", "chores",
    "distant", "jealous", "jealousy", "sulk", "cold shoulder",
    "misunderstanding", "spouse", "married", "routine", "annoyed at",
    "mad at", "best friend",
  ],
  neithal: [
    "interview", "waiting to hear", "waiting for a reply", "text back",
    "reply", "apartment", "roommate moved out", "anxious", "anxiety",
    "nervous", "results", "application", "phone", "notification", "quiet",
  ],
  palai: [
    "moved", "new city", "relocate", "relocated", "goodbye", "airport",
    "heatwave", "commute", "journey", "travel", "left home", "hometown",
    "far away", "hardship", "long trip", "moving away", "left behind",
  ],
};

// Three pre-written stanzas per thinai, using only that thinai's fixed
// imagery. Index i is paired 1:1 with the i-th seed situation for that
// thinai (see SEED_SITUATIONS in thinai.ts), and is also the pool Create
// mode draws from for arbitrary user text.
const STANZAS: Record<ThinaiKey, string[]> = {
  kurinji: [
    `The kurinji waits twelve years to open,
tonight it opens anyway.
A peacock cries once in the bamboo dark
and the waterfall does not stop to listen.
Two paths up the mountain
have just become one.`,
    `Midnight, and the hill path we knew as children
is narrower than we remember, or we are wider.
The peacock that watched us then watches us now,
unbothered by the years between.
Somewhere below, a waterfall
keeps the sound it always kept.`,
    `The kurinji has not bloomed yet, but the mist
already smells of it.
A peacock steps once, twice, onto the ledge,
and does not fly.
Whatever the mountain has been holding
is about to be midnight.`,
  ],
  mullai: [
    `Every evening the cattle find their own way home
without needing to be called.
Jasmine closes slow along the fence line,
the koel says its one sentence and stops.
The lamp is lit before it is needed,
in case tonight is different.`,
    `The rain has not come yet but the clouds
have already taken their place over the pasture.
Someone has swept the doorway twice.
The jasmine by the gate opens at dusk
the way it always has, whether or not
anyone is there to smell it.`,
    `Dusk again, and the herd path is empty
in the particular way that means not yet.
A koel finishes its call before the dark does.
The jasmine holds its scent
the way a house holds a name
it has not stopped saying.`,
  ],
  marutham: [
    `Before sunrise the canal is still arguing with itself,
one bank in shadow, one already lit.
A heron stands at the edge, not fishing,
not leaving either.
The marutham flowers have fallen
where the water can't decide which way to carry them.`,
    `Two fields, one bund between them,
and this morning neither side has been ploughed.
The heron keeps its own distance from the water,
watching without wading in.
Marutham petals sit on the still canal
going nowhere, taking their time about it.`,
    `The paddy field holds the same water it held yesterday,
and still the reflection looks different.
A heron on the near bank, another on the far one,
both facing the current, neither facing each other.
Dawn comes up the usual way,
which this morning is not enough.`,
  ],
  neithal: [
    `The boats that went out at noon
are only shapes now against the light.
A neithal closes on the tide line
before it has decided to.
Gulls keep circling the place
where the last one came in.`,
    `The tide has taken the footprints
that were here an hour ago.
One gull works the empty shoreline
where there used to be two.
The water-lily shuts for the night
on schedule, the only thing that is.`,
    `Sunset, and still the sea keeps
its appointments better than anyone.
A gull turns once over the water
and does not come down.
The shore keeps the same watch it kept at noon,
just longer now, and dimmer.`,
  ],
  palai: [
    `Noon, and the road gives no shade to anyone,
not even to the palai tree that lines it.
A vulture holds its circle high and patient,
in no hurry to be wrong.
The path ahead looks exactly like
the path already walked.`,
    `The heat sits on the road like something parked there.
Palai flowers, what few there are, have already given up their color.
A vulture rides the same warm air
that makes everything else want to stop moving.
Somewhere behind, out of sight now,
is the only shade worth naming.`,
    `The scrubland does not care that this is the last hour.
A vulture crosses it anyway, unhurried, unaware.
Palai flowers hold on by very little,
which turns out to be enough to hold on.
Two sets of footprints leave the same gate
and do not agree on a direction.`,
  ],
};

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function classifyThinaiFallback(situation: string): { thinai: ThinaiKey; reason: string } {
  const lower = situation.toLowerCase();
  let bestKey: ThinaiKey = THINAI_KEYS[0];
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const key of THINAI_KEYS) {
    const matches = KEYWORDS[key].filter((kw) => lower.includes(kw));
    if (matches.length > bestScore) {
      bestScore = matches.length;
      bestKey = key;
      bestMatches = matches;
    }
  }

  const reason =
    bestScore > 0
      ? `Keyword match (no Bedrock call): "${bestMatches[0]}" fits ${THINAI[bestKey].landscape.toLowerCase()}'s conventional territory.`
      : `No strong landscape keyword found in the wording; defaulted to ${bestKey} (${THINAI[bestKey].landscape.toLowerCase()}).`;

  return { thinai: bestKey, reason };
}

export function writeStanzaFallback(situation: string, thinai: ThinaiKey): string {
  const variants = STANZAS[thinai];
  const index = hashString(situation) % variants.length;
  return variants[index];
}

export function pickRandomSeed(): { situation: string; thinai: ThinaiKey } {
  return SEED_SITUATIONS[Math.floor(Math.random() * SEED_SITUATIONS.length)];
}

export function stanzaForSeedSituation(situation: string, thinai: ThinaiKey): string {
  const sameThinai = SEED_SITUATIONS.filter((s) => s.thinai === thinai);
  const index = sameThinai.findIndex((s) => s.situation === situation);
  const variants = STANZAS[thinai];
  return variants[index >= 0 ? index % variants.length : 0];
}

export function pickGiveaway(thinaiData: ThinaiEntry): string {
  return thinaiData.giveawayImages[Math.floor(Math.random() * thinaiData.giveawayImages.length)];
}
