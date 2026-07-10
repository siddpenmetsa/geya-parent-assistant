import { fallbackMessage } from "./config.js";

const CLARIFY_PATTERNS = [
  {
    terms: ["division", "league", "team", "play in"],
    question: "Which sport and grade level should I use for the division lookup?"
  },
  {
    terms: ["equipment", "bring", "first practice"],
    question: "Which sport is this for? Equipment requirements can vary by program."
  },
  {
    terms: ["registration", "register", "fee", "deadline"],
    question: "Which sport or program are you asking about?"
  }
];

function needsClarification(question, sport, ageGroup) {
  const lower = question.toLowerCase();
  const match = CLARIFY_PATTERNS.find((item) => item.terms.some((term) => lower.includes(term)));
  if (!match) return "";
  if (sport !== "all" && ageGroup !== "all") return "";
  if (lower.includes("contact") || lower.includes("website")) return "";
  return match.question;
}

// Minimum number of overlapping meaningful keywords a KB sentence must have
// with the question before it's considered a candidate answer. Raising this
// from 1 to 2 stops single-word coincidental matches (e.g. "play") from
// pulling in unrelated sentences from the knowledge base.
const MIN_SENTENCE_KEYWORD_OVERLAP = 2;

function pickRelevantSentences(question, chunks) {
  const words = new Set(question.toLowerCase().split(/\W+/).filter((word) => word.length > 3));
  const bestScore = chunks[0]?.score || 0;
  const focusedChunks = chunks.filter((chunk) => chunk.score >= bestScore * 0.72).slice(0, 2);
  const sentences = [];

  for (const chunk of focusedChunks) {
    for (const sentence of chunk.text.split(/(?<=[.!?])\s+/)) {
      if (/assistant can help|knowledge base|indexed resources/i.test(sentence)) continue;
      const score = sentence
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => words.has(word)).length;
      if (score >= MIN_SENTENCE_KEYWORD_OVERLAP) sentences.push({ sentence, score, source: chunk });
    }
  }

  return sentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.sentence.trim())
    .filter(Boolean);
}

export function buildPrompt({ question, chunks }) {
  const context = chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.title}\nURL: ${chunk.url || "No URL"}\n${chunk.text}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are GEYA Parent Assistant. Answer only using the provided GEYA resources. Give the exact information from the resources directly instead of telling families to look at a page. Do not invent registration dates, fees, schedules, or policies. If the resources do not verify the answer, use the required fallback sentence exactly. Be concise, friendly, and professional. Ask a clarifying question when needed."
    },
    {
      role: "user",
      content: `Question: ${question}\n\nGEYA resources:\n${context}`
    }
  ];
}

function asksForSensitiveFact(question) {
  return /\b(when|date|deadline|open|close|closes|opens|fee|fees|cost|price|refund|schedule|time|document|documents|paperwork|forms?|proof|waiver|medical|clearance)\b/i.test(question);
}

function hasConcreteSensitiveFact(sentences) {
  return sentences.some((sentence) => {
    const hasNumberedFact = /\b(\$[0-9]|[0-9]{1,2}\/[0-9]{1,2}|20[0-9]{2}|[0-9]{1,2}\s?(am|pm))\b/i.test(sentence);
    const hasMonth = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(sentence);
    return hasNumberedFact || hasMonth;
  });
}

function mentions(question, terms) {
  const lower = question.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

// Pattern-based matching (instead of exact-phrase-only matching) so that
// natural variants like "Where should my son play?", "Which league is
// right for my daughter?", and "What team should my kid join?" are all
// recognized as the same underlying intent: division/placement guidance.
function asksAboutDivisionPlacement(question) {
  const lower = question.toLowerCase();
  const patterns = [
    /\b(what|which)\s+(division|league|team|program)\b/,
    /where should .* (play|go)/,
    /(should|could) my (child|kid|son|daughter) play/,
    /(child|kid|son|daughter).*\b(division|league|team)\b/,
    /right for my (son|daughter|kid|child)/,
    /what (team|division|league) should/
  ];
  return patterns.some((re) => re.test(lower));
}

function asksAboutDocuments(question) {
  return mentions(question, [
    "document",
    "documents",
    "paperwork",
    "form",
    "forms",
    "proof",
    "birth certificate",
    "medical",
    "waiver",
    "clearance"
  ]);
}

function wantsSoccer(question, sport) {
  return sport === "soccer" || mentions(question, ["soccer", "futsal", "shin", "cleats", "ball"]);
}

function wantsHigh5(question, sport) {
  return sport === "high5" || mentions(question, ["high 5", "high5", "special needs", "buddy"]);
}

function wantsBaseball(question, sport) {
  return sport === "baseball" || mentions(question, ["baseball", "little league", "tee ball", "pitch", "bat"]);
}

function directAnswer(question, sport) {
  if (asksAboutDivisionPlacement(question)) {
    const soccerKnown = wantsSoccer(question, sport);
    const baseballKnown = wantsBaseball(question, sport);

    // Sport not specified yet — keep it short, conversational, and ask a
    // clarifying question instead of dumping every division across both
    // sports. This matches the "helpful coordinator" tone rather than a
    // document search engine.
    if (!soccerKnown && !baseballKnown) {
      return "Choosing the right GEYA division really comes down to your child's age, grade, and how much experience they have with the sport. Once I know the sport, age, and grade, I can point you to the right fit — what sport are they interested in, and what grade are they in?";
    }

    if (soccerKnown) {
      return [
        "For soccer, here's generally how families choose:",
        "- New to soccer and just learning the basics? Kindergarten-1st Grade is a great starting point.",
        "- Building passing, teamwork, and confidence? 2nd/3rd Grade or 4th/5th Grade tends to fit.",
        "- Looking for more structured, competitive play? 6th-8th Grade is usually the right level.",
        "- High schoolers play in the Coed 9th-12th Grade division.",
        "",
        "What grade is your child in? I can narrow it down from there."
      ].join("\n");
    }

    // baseballKnown
    return [
      "For baseball, placement is mostly age-based:",
      "- Just starting out, ages 4-7? That's Tee Ball.",
      "- Building skills around ages 5-8 (with a year of Tee Ball under their belt if they're 5-6)? Coach/Machine Pitch.",
      "- Ages 8-10 typically play Minor Player Pitch, and ages 9-12 play Major.",
      "- Older players move into Intermediate 50/70 (11-13), Junior (12-14), or Senior (13-16).",
      "",
      "How old is your child? I can tell you exactly which division that lands them in."
    ].join("\n");
  }

  if (asksAboutDocuments(question)) {
    if (mentions(question, ["volunteer", "coach", "coaching", "background", "clearance"])) {
      return [
        "For volunteering and coaching, GEYA's official resources list these requirements:",
        "- Little League Baseball volunteers must complete a Little League volunteer application.",
        "- Little League Baseball volunteers must pass the required national background check.",
        "- HIGH 5 buddies over 18 must complete the background checks required by Pennsylvania.",
        "GEYA's available resources do not list additional registration documents for players."
      ].join("\n");
    }

    return fallbackMessage;
  }

  if (mentions(question, ["who is geya", "what is geya", "about", "mission"])) {
    return [
      "GEYA is the Glenmoore Eagle Youth Association.",
      "It is a nonprofit, volunteer organization offering Recreational Soccer, HIGH 5 Soccer, Little League Baseball, and Junior American Legion Baseball for children from Kindergarten through High School.",
      "GEYA's mission centers on excellence in athletics, teamwork, good sportsmanship, friendship, confidence, goodwill, and leadership."
    ].join("\n");
  }

  if (mentions(question, ["register", "registration", "sign up", "signup"]) && sport === "all") {
    return [
      "GEYA registration is online and program-specific:",
      "- GEYA Soccer uses TeamSnap for registration and team management.",
      "- 2026 Fall Soccer registration: Early Bird June 1 to June 30; Regular July 1 to July 31; Late August 1 to August 15.",
      "- 2026 Spring Soccer registration deadline: March 7, 2026. Spring fees are Early Bird $105, Regular $115, and Late $130.",
      "- Soccer registration questions: registrations@geyasoccer.org or geyareg@gmail.com.",
      "- GEYA Little League Baseball registration is handled through the GEYA Baseball main site.",
      "- HIGH 5 Soccer player and buddy registration is available through TeamSnap.",
      "- Junior American Legion Baseball has a 2024 TeamSnap registration form listed in the current indexed GEYA resources."
    ].join("\n");
  }

  if (mentions(question, ["equipment", "bring", "wear", "first practice", "checklist"]) && sport === "all") {
    return [
      "GEYA equipment information available in the official resources:",
      "",
      "Recreational Soccer:",
      "- Bring a properly inflated soccer ball with the player's name on it.",
      "- Ball size 3: Kindergarten and 1st Grade.",
      "- Ball size 4: 2nd/3rd Grade and 4th/5th Grade.",
      "- Ball size 5: 6th-8th Grade and Coed.",
      "- Shin guards must be worn under socks for all practices and games.",
      "- Cleats are recommended.",
      "- Bring an individual water bottle.",
      "- Earrings are not permitted during participation.",
      "",
      "HIGH 5 Soccer:",
      "- Bring a water bottle.",
      "- Wear sneakers and comfortable clothes.",
      "- Players receive a HIGH 5 t-shirt on the first day and should wear it to every session.",
      "- Cleats and shin guards are optional.",
      "",
      "Little League Baseball:",
      "- The indexed GEYA resources describe Tee Ball as using bats and balls designated for that division, but they do not list a complete player equipment checklist."
    ].join("\n");
  }

  if (wantsSoccer(question, sport) && mentions(question, ["register", "registration", "open", "close", "deadline", "fee", "cost", "price"])) {
    return [
      "GEYA Soccer registration details:",
      "- 2026 Fall Soccer Early Bird Registration: June 1 to June 30.",
      "- 2026 Fall Soccer Regular Registration: July 1 to July 31.",
      "- 2026 Fall Soccer Late Registration: August 1 to August 15.",
      "- 2026 Spring Soccer registration deadline: March 7, 2026.",
      "- 2026 Spring Soccer Early Bird Registration: December 15 to January 31.",
      "- 2026 Spring Soccer Regular Registration: February 1 to February 28.",
      "- 2026 Spring Soccer Late Registration: March 1 to March 7.",
      "- 2026 Spring Soccer fees: Early Bird $105, Regular $115, Late $130.",
      "- Sibling discount: $15 per additional sibling after the first.",
      "- Volunteer discount for coaches and board members: $15 per season, credited manually at midseason.",
      "- Registration questions: registrations@geyasoccer.org or geyareg@gmail.com."
    ].join("\n");
  }

  if (wantsSoccer(question, sport) && mentions(question, ["equipment", "bring", "wear", "first practice", "checklist", "cleats", "shin"])) {
    return [
      "For GEYA Soccer, players should bring and wear:",
      "- A properly inflated soccer ball with the player's name on it.",
      "- Ball size 3 for Kindergarten and 1st Grade.",
      "- Ball size 4 for 2nd/3rd Grade and 4th/5th Grade.",
      "- Ball size 5 for 6th-8th Grade and Coed.",
      "- Shin guards under socks for all practices and games.",
      "- Cleats are recommended.",
      "- An individual water bottle is recommended.",
      "- Earrings are not permitted; players must remove them before participating."
    ].join("\n");
  }

  if (wantsSoccer(question, sport) && mentions(question, ["division", "grade", "age", "team"])) {
    return [
      "GEYA Soccer divisions:",
      "- Boys: Kindergarten, 1st Grade, 2nd/3rd Grade, 4th/5th Grade, and 6th-8th Grade.",
      "- Girls: Kindergarten, 1st Grade, 2nd/3rd Grade, 4th/5th Grade, and 6th-8th Grade.",
      "- Coed: 9th-12th Grade.",
      "- HIGH 5 Soccer: players with special needs."
    ].join("\n");
  }

  if (wantsSoccer(question, sport) && mentions(question, ["field", "where", "location", "games", "practice"])) {
    return [
      "GEYA Soccer field locations:",
      "- Kindergarten, 1st Grade, and 2nd/3rd Grade: Walnut Lane Park, 803 Walnut Lane, Chester Springs.",
      "- 4th/5th Grade: Larkins Field, corner of Byers Road and Graphite Mine Road, Chester Springs.",
      "- 6th-8th Grade: Fellowship Field, 241 Fellowship Road, Chester Springs. Fields 3 and 4 use the upper parking lot; Field 1 is turf and uses the lower parking lot.",
      "- Coed 9th-12th Grade: Fellowship Field, 241 Fellowship Road, Chester Springs. Field 1 is turf and uses the lower parking lot; Fields 3 and 4 use the upper parking lot."
    ].join("\n");
  }

  if (wantsSoccer(question, sport) && mentions(question, ["schedule", "practice", "first game", "team assignment", "teamsnap"])) {
    return [
      "GEYA Soccer schedule and TeamSnap details:",
      "- GEYA Soccer uses TeamSnap for registration and team management.",
      "- After registration ends, GEYA needs about 10 days to build rosters and assign coaches.",
      "- Rosters and schedules are published in TeamSnap.",
      "- Coaches send first-practice information through TeamSnap.",
      "- All divisions practice twice before the first game except Coed, which practices once.",
      "- Each team has two events each week: one weeknight event Monday through Thursday and one Saturday morning or early afternoon event."
    ].join("\n");
  }

  if (wantsHigh5(question, sport)) {
    return [
      "GEYA HIGH 5 Soccer is a program for players with special needs.",
      "- Players pair once a week with a teen or adult buddy for adapted soccer activities and games.",
      "- HIGH 5 focuses on teamwork, self-esteem, sportsmanship, respect, and fun.",
      "- Player ages: 5 to 18.",
      "- Cost: free for all participants thanks to donations and GEYA Soccer.",
      "- Sessions: Sundays, September 13 to November 8.",
      "- Location: Fellowship Field #1, 240 Fellowship Road, Chester Springs.",
      "- Bring: water bottle, sneakers, and comfortable clothes. Players receive a HIGH 5 t-shirt on the first day. Cleats and shin guards are optional.",
      "- Buddy questions: HIGH5@geyasoccer.org."
    ].join("\n");
  }

  if (wantsBaseball(question, sport) && mentions(question, ["division", "age", "play in", "league"])) {
    return [
      "GEYA Little League Baseball divisions:",
      "- Tee Ball: ages 4-7.",
      "- Minor Coach/Machine Pitch: League Age 5-8; League Age 5-6 players must have completed one year of Tee Ball.",
      "- Minor Player Pitch: ages 8-10.",
      "- Major: ages 9-12.",
      "- Intermediate 50/70: league-age 11-13.",
      "- Junior: ages 12-14.",
      "- Senior: ages 13-16."
    ].join("\n");
  }

  if (wantsBaseball(question, sport) && mentions(question, ["register", "registration"])) {
    return [
      "GEYA Little League Baseball registration is handled through the GEYA Baseball main site.",
      "A GEYA post dated February 23, 2026 says families should register for the upcoming baseball season through that baseball main site."
    ].join("\n");
  }

  if (mentions(question, ["volunteer", "coach", "help"])) {
    return [
      "Volunteer options listed by GEYA:",
      "- GEYA Soccer: parents can help as a Division Commissioner, Volunteer Coach, or Soccer Board member. Contact Jay Janczak at president@geyasoccer.org.",
      "- Soccer coaches interested in coaching multiple teams must register for each division individually.",
      "- Little League Baseball: parents can help after completing a Little League volunteer application and passing the required national background check. Volunteer roles may include coach, manager, umpire, local league board member, or other league positions.",
      "- HIGH 5 Soccer: volunteers can help as buddies, activity leaders, or snack helpers. Soccer experience is not required."
    ].join("\n");
  }

  if (mentions(question, ["contact", "email", "question"])) {
    return [
      "GEYA contacts available in the indexed resources:",
      "- Soccer registration questions: registrations@geyasoccer.org or geyareg@gmail.com.",
      "- Soccer volunteer questions: Jay Janczak at president@geyasoccer.org.",
      "- HIGH 5 buddy questions: HIGH5@geyasoccer.org.",
      "- Baseball sponsorship opportunities: geyasponsorships@gmail.com.",
      "- GEYA Soccer mailing address: P.O. Box 164, Uwchland, PA 19480."
    ].join("\n");
  }

  return "";
}

export function buildExtractiveAnswer({ question, chunks, sport, ageGroup }) {
  const direct = directAnswer(question, sport);
  if (direct) return { answer: direct, confidence: "grounded" };

  const clarify = needsClarification(question, sport, ageGroup);
  if (clarify && chunks.length < 2) return { answer: clarify, confidence: "clarify" };

  const sentences = pickRelevantSentences(question, chunks);

  // When nothing clears the relevance bar, prefer a clarifying question
  // (if one applies to this topic) over the generic fallback — this reads
  // like a coordinator asking for more detail rather than a search engine
  // coming up empty.
  if (!sentences.length) {
    return { answer: clarify || fallbackMessage, confidence: "none" };
  }
  if (asksForSensitiveFact(question) && !hasConcreteSensitiveFact(sentences)) {
    return { answer: clarify || fallbackMessage, confidence: "none" };
  }

  const bullets = sentences.map((sentence) => `- ${sentence}`).join("\n");
  return {
    answer: bullets,
    confidence: "grounded"
  };
}

export function buildFollowUps(question, answer) {
  // If the bot failed to find an answer, or asked to clarify, hide follow-ups completely.
  if (answer === fallbackMessage || !answer) {
    return [];
  }

  const lower = question.toLowerCase();

  // These questions are guaranteed to hit your hardcoded directAnswer rules
  if (lower.includes("register") || lower.includes("fee") || lower.includes("cost")) {
    return [
      "What background clearances do volunteers need?",
      "How do I volunteer to help?",
      "How can I contact GEYA?"
    ];
  }

  if (lower.includes("equipment") || lower.includes("bring") || lower.includes("practice")) {
    return [
      "Where are the soccer field locations?",
      "What equipment do I need to bring?",
      "What division should my child play in?"
    ];
  }

  if (lower.includes("division") || lower.includes("league") || lower.includes("team") || lower.includes("play in")) {
    return [
      "What's my child's age or grade?",
      "What equipment does my child need?",
      "When does registration open?"
    ];
  }

  return [
    "How do I register?",
    "What equipment do I need to bring?",
    "What division should my child play in?"
  ];
}