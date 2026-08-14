// Tinai Poet — canonical knowledge base.
//
// Classical Sangam Tamil poetics (Tholkappiyam, Porulatikaram, Ainthinai
// framework) divides human love/emotion into five thinai — landscapes —
// each with a fixed set of conventional images. A poem never names the
// emotion; the landscape imagery carries it.
//
// This file is the ONLY source of cultural fact in the system. Bedrock
// is only ever allowed to (a) pick a key from THINAI and (b) write
// English lines using the fields already present on that object. It must
// never be asked to recall or invent a flower, deity, bird, or landscape
// association — those come from here, not from the model.
//
// Duplicated verbatim into backend/ and frontend/ at deploy time (see
// DECISIONS.md) since Lambda and Amplify are separate build units with
// no shared workspace tooling in this one-day build.

const THINAI = {
  kurinji: {
    key: "kurinji",
    landscape: "Mountains",
    terrain:
      "Steep, mist-wrapped mountain slopes, waterfalls, bamboo groves, narrow hill paths",
    mood: "Union — the electric first meeting of new love",
    classicalTerm: "puṇartal (union)",
    flower: "Kurinji (Strobilanthes kunthiana) — a mountain flower that blooms only once every twelve years",
    bird: "Peacock",
    timeOfDay: "Midnight",
    deity: "Seyon (Murugan), god of youth and war",
    drum: "Thondagam",
    occupation: "Hill tribes — honey gathering, millet cultivation, hunting",
    palette: {
      background: "#EEF0FB",
      accent: "#4B3F8F",
      text: "#241E42",
    },
    giveawayImages: ["kurinji flower in bloom", "peacock", "midnight mountain mist"],
  },

  mullai: {
    key: "mullai",
    landscape: "Forest and pasture",
    terrain:
      "Grazing meadows at the forest's edge, gathering rain clouds, cattle paths home",
    mood: "Patient waiting — quiet faithfulness while the beloved is away",
    classicalTerm: "iruttal / āṟṟiruttal (patient endurance)",
    flower: "Mullai (wild jasmine)",
    bird: "Koel (Asian koel, cuckoo)",
    timeOfDay: "Evening, dusk — when the herds return home",
    deity: "Mayon (Vishnu), the dark-hued one",
    drum: "Kotukotti",
    occupation: "Cowherds and shepherds — cattle herding, forest dwelling",
    palette: {
      background: "#EAF3EA",
      accent: "#2F6B3A",
      text: "#1B3820",
    },
    giveawayImages: ["mullai jasmine", "cattle returning at dusk", "gathering rain clouds"],
  },

  marutham: {
    key: "marutham",
    landscape: "Farmland and river plains",
    terrain:
      "Flat irrigated paddy fields, river canals, bunds between fields",
    mood: "Estrangement — the domestic quarrel, jealousy, the ache of routine love gone cold",
    classicalTerm: "ūdal (sulking, estrangement)",
    flower: "Marutham (Terminalia arjuna / Queen's flower) — pale blossoms along the canal bank",
    bird: "Heron (white paddy-field heron)",
    timeOfDay: "Early morning, just before dawn",
    deity: "Ventan (Indiran), king of the gods",
    drum: "Kalavam",
    occupation: "Paddy farmers — irrigation, ploughing, harvest",
    palette: {
      background: "#FBF3DE",
      accent: "#9C7A16",
      text: "#3B2F0B",
    },
    giveawayImages: ["marutham flowers along the canal", "heron in the paddy field", "early morning over the river plain"],
  },

  neithal: {
    key: "neithal",
    landscape: "Seashore",
    terrain: "Sandy shoreline, backwaters, fishing boats drawn up on the sand",
    mood: "Anxious longing — pining by the water for one who is late to return",
    classicalTerm: "irangal (lament, anxious pining)",
    flower: "Neithal (blue water-lily)",
    bird: "Seagull",
    timeOfDay: "Sunset, evening over the water",
    deity: "Kadalon (Varunan), god of the sea",
    drum: "Padalai",
    occupation: "Fisherfolk — fishing, salt-panning, pearl diving",
    palette: {
      background: "#E4F3F3",
      accent: "#1C6E6E",
      text: "#123B3B",
    },
    giveawayImages: ["neithal water-lily", "fishing boats at sunset", "seagulls over the shore"],
  },

  palai: {
    key: "palai",
    landscape: "Wasteland",
    terrain:
      "Sun-cracked scrubland, thorn trees, dry riverbeds, shimmering heat over the path",
    mood: "Hardship of separation — the harsh journey, parting, or long enduring absence",
    classicalTerm: "pirivu (separation, hardship of parting)",
    flower: "Palai (Wrightia tinctoria) — sparse, pale blossoms on bare thorny scrub",
    bird: "Vulture",
    timeOfDay: "Noon, the harshest heat of the day",
    deity: "Korravai, goddess of war and victory",
    drum: "Paranthalai",
    occupation: "Wayfarers and caravan travelers — crossing the wasteland on a long journey",
    palette: {
      background: "#F7EFE2",
      accent: "#A45B23",
      text: "#3E2612",
    },
    giveawayImages: ["blazing noon sun", "vulture over dry scrub", "cracked wasteland earth"],
  },
};

// Ordered list of the five valid keys — used to validate Bedrock's
// classification output. Anything outside this set is a rejected answer.
const THINAI_KEYS = ["kurinji", "mullai", "marutham", "neithal", "palai"];

// ~15 seed situations for Play mode — three per thinai, modern and
// everyday. Each is tagged with its correct answer so scoring never
// depends on a model's judgment of its own classification.
const SEED_SITUATIONS = [
  { situation: "First date with someone I've liked for months", thinai: "kurinji" },
  { situation: "Reconnecting with a childhood friend after years apart", thinai: "kurinji" },
  { situation: "The moment right before telling someone how I feel about them", thinai: "kurinji" },

  { situation: "My partner is working abroad for a year and we video call every night", thinai: "mullai" },
  { situation: "Waiting for my sibling to come home for the holidays", thinai: "mullai" },
  { situation: "Counting down the days until my partner's ship comes back to port", thinai: "mullai" },

  { situation: "Had a big fight with my best friend over something small", thinai: "marutham" },
  { situation: "My partner and I keep bickering about chores lately", thinai: "marutham" },
  { situation: "Feeling distant from my spouse even though we live together", thinai: "marutham" },

  { situation: "Waiting to hear back after a job interview", thinai: "neithal" },
  { situation: "My roommate moved out and the apartment feels too quiet", thinai: "neithal" },
  { situation: "Refreshing my phone, waiting for a reply that hasn't come", thinai: "neithal" },

  { situation: "Moved to a new city and don't know anyone yet", thinai: "palai" },
  { situation: "A long, exhausting commute during a heatwave, missing home", thinai: "palai" },
  { situation: "Saying goodbye at the airport, not sure when we'll meet again", thinai: "palai" },
];

module.exports = { THINAI, THINAI_KEYS, SEED_SITUATIONS };
