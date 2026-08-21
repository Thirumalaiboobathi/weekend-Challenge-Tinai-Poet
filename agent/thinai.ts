// Tinai Poet — canonical knowledge base, agent copy.
//
// Duplicated verbatim (module syntax only, and trimmed to what the
// daily agent needs — no SEED_SITUATIONS/Play-mode data) from
// frontend/lib/thinai.ts, itself ported from shared/thinai.js. See
// DECISIONS.md for why this is duplicated rather than shared: the
// agent Lambda is a separate deploy unit from both backend/ and
// frontend/, with no shared workspace tooling in this build.
//
// This file is the ONLY source of cultural fact the agent uses.
// Bedrock is only ever allowed to (a) receive a thinai already chosen
// by the weather mapping (weatherThinai.ts) — never the model's own
// judgement — and (b) write lines using the fields already present on
// that object. It must never invent a flower, deity, bird, or
// landscape association.

export interface ThinaiPalette {
  background: string;
  accent: string;
  text: string;
}

export interface ThinaiEntry {
  key: string;
  landscape: string;
  terrain: string;
  mood: string;
  classicalTerm: string;
  flower: string;
  flowerTamil: string; // canonical Tamil-script name, used to require/verify Tamil generations (see bedrock.ts)
  bird: string;
  birdTamil: string; // canonical Tamil-script name, used to require/verify Tamil generations (see bedrock.ts)
  timeOfDay: string;
  deity: string;
  drum: string;
  occupation: string;
  palette: ThinaiPalette;
  giveawayImages: string[];
}

export const THINAI: Record<string, ThinaiEntry> = {
  kurinji: {
    key: "kurinji",
    landscape: "Mountains",
    terrain:
      "Steep, mist-wrapped mountain slopes, waterfalls, bamboo groves, narrow hill paths",
    mood: "Union — the electric first meeting of new love",
    classicalTerm: "puṇartal (union)",
    flower: "Kurinji (Strobilanthes kunthiana) — a mountain flower that blooms only once every twelve years",
    flowerTamil: "குறிஞ்சி",
    bird: "Peacock",
    birdTamil: "மயில்",
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
    flowerTamil: "முல்லை",
    bird: "Koel (Asian koel, cuckoo)",
    birdTamil: "குயில்",
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
    terrain: "Flat irrigated paddy fields, river canals, bunds between fields",
    mood: "Estrangement — the domestic quarrel, jealousy, the ache of routine love gone cold",
    classicalTerm: "ūdal (sulking, estrangement)",
    flower: "Marutham (Terminalia arjuna / Queen's flower) — pale blossoms along the canal bank",
    flowerTamil: "மருதம்",
    bird: "Heron (white paddy-field heron)",
    birdTamil: "கொக்கு",
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
    flowerTamil: "நெய்தல்",
    bird: "Seagull",
    birdTamil: "கடற்காக்கை",
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
    flowerTamil: "பாலை",
    bird: "Vulture",
    birdTamil: "கழுகு",
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

export const THINAI_KEYS = ["kurinji", "mullai", "marutham", "neithal", "palai"] as const;

export type ThinaiKey = (typeof THINAI_KEYS)[number];
