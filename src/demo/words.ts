// The words the static demo's made-up crowd is made of (generate.ts): every
// name, tag, place, group title and line of chat here is invented for the
// demo. None of the names is a name in the made-up crowd (the life archive's server/fixtures/crowd.ts);
// generate.test.ts holds that, and every word here against your archive where there is one.

/** Who you are in the demo. */
export const SELF_NAME = "Jem Ashgrove";

export const FIRST_NAMES: readonly string[] = [
  "Astrid", "Bram", "Cosima", "Dashiell", "Elspeth", "Fenwick", "Greta", "Huxley", "Imogen", "Jarrah", "Kestrel", "Lorcan",
  "Marguerite", "Nils", "Odessa", "Perrin", "Quilla", "Rafferty", "Saoirse", "Teodor", "Ulla", "Vashti", "Wilhelmina", "Xanthe",
  "Yorick", "Zephyr", "Ansel", "Briony", "Caspian", "Delphine", "Emrys", "Faye", "Gideon", "Hesper", "Ignatius", "Jocasta",
  "Kasimir", "Linnea", "Merritt", "Nerissa", "Osric", "Philippa", "Quincy", "Rosalind", "Sylvan", "Thessaly", "Ulrich", "Verity",
  "Wolfram", "Ysolde", "Zinnia", "Alaric", "Bettina", "Corwin", "Dorothea", "Eirlys", "Florian", "Godfrey", "Honora", "Isadora",
  "Jethro", "Kirsten", "Leopold", "Maelle", "Nikolai", "Ottilie", "Percival", "Romilly", "Sorrel", "Tamsin", "Ursa", "Vivienne",
  "Wendell", "Xiomara", "Yevgenia", "Zbigniew", "Ambrose", "Blythe", "Clemency", "Desmond", "Evander", "Fenella", "Garrick",
  "Hollis", "Ilse", "Jorvik", "Kerensa", "Lysander", "Morwenna", "Nestor", "Oriel", "Peregrine", "Rhoswen", "Sebastiaan", "Tobiah",
  "Una", "Valdemar", "Winifred", "Yolanda", "Zelda", "Aurelio", "Bronwyn", "Cormac", "Dilys", "Eamon", "Freyja", "Gwendolen",
  "Hamlet", "Isolde", "Jubilee", "Kolby", "Lucasta", "Meredith", "Nimue", "Orlando", "Petra", "Rurik", "Seraphina", "Thaddeus",
  "Aldous", "Berenice", "Calloway", "Dagny", "Elowen", "Fintan", "Ginevra", "Halvard", "Iolanthe", "Jessamy", "Leander",
  "Mirabel", "Niamh", "Oswin", "Quillon", "Rosamund", "Severin", "Tindra", "Undine", "Valentin", "Wynne", "Yestin", "Zuleika",
  "Anouk", "Barnaby", "Clementine", "Dov", "Esperanza", "Ferdinand", "Gretchen", "Horatio", "Inigo", "Juniper", "Konstantin",
  "Liesl", "Magnus", "Noemi", "Octavian", "Paloma", "Radomir", "Solveig", "Tancredi", "Ulyana", "Wystan", "Anneliese",
];

/**
 * A hundred made-up places, each a beginning and an ending (a row each, generate.test.ts holds the rule): last names,
 * and where group chats are from. Written out whole, so each reads as a name.
 */
export const PLACES: readonly string[] = [
  "Alderbrook", "Aldercombe", "Alderdale", "Alderfield", "Alderford",
  "Birchbrook", "Birchcombe", "Birchdale", "Birchfield", "Birchford",
  "Coldbrook", "Coldcombe", "Colddale", "Coldfield", "Coldford",
  "Dunbrook", "Duncombe", "Dundale", "Dunfield", "Dunford",
  "Elderbrook", "Eldercombe", "Elderdale", "Elderfield", "Elderford",
  "Fernbrook", "Ferncombe", "Ferndale", "Fernfield", "Fernford",
  "Goldbrook", "Goldcombe", "Golddale", "Goldfield", "Goldford",
  "Hazelbrook", "Hazelcombe", "Hazeldale", "Hazelfield", "Hazelford",
  "Ivybrook", "Ivycombe", "Ivydale", "Ivyfield", "Ivyford",
  "Kingsbrook", "Kingscombe", "Kingsdale", "Kingsfield", "Kingsford",
  "Larkbrook", "Larkcombe", "Larkdale", "Larkfield", "Larkford",
  "Mossbrook", "Mosscombe", "Mossdale", "Mossfield", "Mossford",
  "Netherbrook", "Nethercombe", "Netherdale", "Netherfield", "Netherford",
  "Ormebrook", "Ormecombe", "Ormedale", "Ormefield", "Ormeford",
  "Pinebrook", "Pinecombe", "Pinedale", "Pinefield", "Pineford",
  "Quarrybrook", "Quarrycombe", "Quarrydale", "Quarryfield", "Quarryford",
  "Rookbrook", "Rookcombe", "Rookdale", "Rookfield", "Rookford",
  "Stonebrook", "Stonecombe", "Stonedale", "Stonefield", "Stoneford",
  "Thornbrook", "Thorncombe", "Thorndale", "Thornfield", "Thornford",
  "Wickbrook", "Wickcombe", "Wickdale", "Wickfield", "Wickford",
];

export const LAST_NAMES: readonly string[] = [
  "Ashgrove", "Brightwater", "Cobbleton", "Dunmore", "Eastwick", "Fairweather", "Gallowdale", "Hartwell", "Ironbark", "Jessop",
  "Kingsmill", "Lockridge", "Marchbank", "Northcote", "Oakhurst", "Pemberly", "Quayle", "Ravenscroft", "Sandbrook", "Thornbury",
  "Underhill", "Vantage", "Whitlock", "Yardley", "Abernathy", "Bellweather", "Crossfield", "Dimbleby", "Ellingham", "Featherstone",
  "Greenhalgh", "Hollingsworth", "Inchbold", "Jarvie", "Kettleburn", "Lindqvist", "Mortlake", "Netherwood", "Ormsby", "Prendergast",
  "Quennell", "Rushbrook", "Stanfield", "Tallis", "Upton", "Vosper", "Wainfleet", "Yeardley", "Ashby", "Blakemore",
  // And a hundred more, the made-up places.
  ...PLACES,
];

/** Your tags, in the tag table's order, with how likely each is on a tagged person (the shape gives how many are tagged). */
export const TAGS: ReadonlyArray<{ tag: string; weight: number }> = [
  { tag: "climbing", weight: 14 },
  { tag: "uni", weight: 12 },
  { tag: "work", weight: 11 },
  { tag: "family", weight: 6 },
  { tag: "footy", weight: 8 },
  { tag: "book-club", weight: 4 },
  { tag: "neighbours", weight: 5 },
  { tag: "travel", weight: 5 },
  { tag: "music", weight: 3 },
  { tag: "cooking", weight: 2 },
  { tag: "school", weight: 9 },
  { tag: "running", weight: 4 },
  { tag: "board-games", weight: 3 },
  { tag: "cycling", weight: 3 },
  { tag: "old-work", weight: 7 },
  { tag: "housemates", weight: 3 },
  { tag: "online", weight: 4 },
  { tag: "exchange", weight: 5 },
  { tag: "choir", weight: 2 },
];

/** A tag Hide switches on to start with, besides archive: someone carries it, so Hide has something to do. */
export const COMMERCIAL_TAG = "commercial";

/** Where people are, as far as you last knew, with how likely each is. */
export const LOCATION_VALUES: ReadonlyArray<{ value: string; weight: number }> = [
  { value: "Melbourne", weight: 60 },
  { value: "Sydney", weight: 14 },
  { value: "Brisbane", weight: 8 },
  { value: "Hobart", weight: 3 },
  { value: "Adelaide", weight: 4 },
  { value: "Wellington", weight: 1 },
  ...["Perth", "Canberra", "Auckland", "Geelong", "Ballarat", "Mildura", "Newcastle", "Wollongong", "Gold Coast", "Darwin",
    "Cairns", "Launceston", "Christchurch", "Singapore", "Hong Kong", "Tokyo", "Seoul", "Shanghai", "Beijing", "Taipei",
    "Kuala Lumpur", "Jakarta", "Bangkok", "Hanoi", "Manila", "London", "Berlin", "Paris", "Amsterdam", "Lisbon", "Barcelona",
    "Dublin", "Edinburgh", "Copenhagen", "Stockholm", "New York", "San Francisco", "Los Angeles", "Toronto", "Vancouver",
    "Chicago", "Seattle", "Zurich", "Vienna"].map((value, i) => ({ value, weight: i < 12 ? 2 : 1 })),
];

/** Notes you keep about a few people. */
export const NOTES: readonly string[] = [
  "Lends good books",
  "Moving house in March",
  "Vegetarian, for dinners",
  "Knows everyone at the gym",
  "Ask about the new job",
  "Birthday in June",
  "Owes me a tent",
];

/** Notes on your catch-ups (empty for none, as most are). */
export const CATCH_UP_NOTES: readonly string[] = [
  "Dinner", "Coffee", "Brunch", "Climbing at the gym", "Walk along the river", "Birthday drinks", "Board games",
  "Farmers market", "Helped move house", "Picnic in the park", "", "", "", "", "",
];

/** Nicknames a person may go by, made from their first name. */
export function nicknameOf(first: string): string {
  return first.length > 5 ? first.slice(0, 3) + (/[aeiou]$/i.test(first.slice(0, 3)) ? "" : "ie") : `${first}y`;
}

/** A group chat: its title, which topic its chat is about, how big it tends to be, and which tags its members come from. */
export interface GroupKind {
  title: string;
  topic: string;
  size: number;
  from: string[];
}

export const GROUPS: readonly GroupKind[] = [
  { title: "Tuesday climbing", topic: "climbing", size: 9, from: ["climbing"] },
  { title: "Uni mates", topic: "uni", size: 12, from: ["uni"] },
  { title: "Lunch crew", topic: "work", size: 7, from: ["work"] },
  { title: "Family", topic: "family", size: 6, from: ["family"] },
  { title: "Housemates", topic: "home", size: 4, from: ["uni", "work"] },
  { title: "Book club", topic: "books", size: 8, from: ["book-club"] },
  { title: "Footy tips", topic: "footy", size: 11, from: ["footy"] },
  { title: "Hobart trip", topic: "travel", size: 6, from: ["travel", "climbing"] },
  { title: "Fig St neighbours", topic: "neighbours", size: 10, from: ["neighbours"] },
  { title: "Gig buddies", topic: "music", size: 5, from: ["music"] },
  { title: "Dinner rotation", topic: "food", size: 5, from: ["cooking", "work", "uni"] },
  { title: "Old team", topic: "work", size: 8, from: ["work"] },
];

/** The big group chats of people met nowhere else: the rules archive their members (groups-silent and groups-wrote). */
export const BIG_GROUPS: readonly GroupKind[] = [
  { title: "Fig St residents", topic: "neighbours", size: 34, from: [] },
  { title: "Marathon 2024", topic: "running", size: 26, from: [] },
];

/**
 * The rest of the group chats' titles: a made-up place (PLACES), so no title is any real chat's, then a beginning,
 * each with the topic its chat is about, and an ending: small ones from `small`, big ones (a crowd of people met
 * nowhere else) from `big`.
 */
export const GROUP_TITLES: { starts: ReadonlyArray<{ start: string; topic: string }>; small: readonly string[]; big: readonly string[] } = {
  starts: [
    { start: "Bouldering", topic: "climbing" }, { start: "Crag", topic: "climbing" }, { start: "Footy", topic: "footy" },
    { start: "Netball", topic: "footy" }, { start: "Trivia", topic: "general" }, { start: "Brunch", topic: "food" },
    { start: "Dumpling", topic: "food" }, { start: "Supper", topic: "food" }, { start: "Camping", topic: "travel" },
    { start: "Snow trip", topic: "travel" }, { start: "Road trip", topic: "travel" }, { start: "Lantern", topic: "travel" },
    { start: "Board game", topic: "general" }, { start: "Parkrun", topic: "running" }, { start: "Trail run", topic: "running" },
    { start: "Choir", topic: "music" }, { start: "Gig", topic: "music" }, { start: "Vinyl", topic: "music" },
    { start: "Reading", topic: "books" }, { start: "Zine", topic: "books" }, { start: "Thesis", topic: "uni" },
    { start: "Tutorial", topic: "uni" }, { start: "Exchange", topic: "uni" }, { start: "Lab", topic: "uni" },
    { start: "Standup", topic: "work" }, { start: "Launch", topic: "work" }, { start: "Hackday", topic: "work" },
    { start: "Offsite", topic: "work" }, { start: "Cousins", topic: "family" }, { start: "Grandma's birthday", topic: "family" },
    { start: "Sunday roast", topic: "family" }, { start: "Laneway", topic: "neighbours" }, { start: "Garden plot", topic: "neighbours" },
    { start: "Flat", topic: "home" }, { start: "Share house", topic: "home" }, { start: "Kayak", topic: "general" },
    { start: "Pottery", topic: "general" }, { start: "Karaoke", topic: "music" }, { start: "Ferry", topic: "general" },
    { start: "Picnic", topic: "food" },
  ],
  small: [
    "crew", "chat", "gang", "squad", "people", "team", "mates", "planning", "night", "weekend", "2019", "2022", "2024", "club",
    "friends", "lot", "folks", "circle", "corner", "society",
  ],
  big: ["community", "noticeboard", "network", "members", "announcements", "swap", "alumni", "everyone"],
};

/** What Marketplace sellers sold. */
export const MARKETPLACE_ITEMS: readonly string[] = ["Road bike", "Bookshelf", "Standing desk"];

/** What people talk about: lines to open an exchange with, and lines to answer with, by topic; "general" fits anyone. */
export interface Lines {
  openers: readonly string[];
  replies: readonly string[];
}

export const LINES: Readonly<Record<string, Lines>> = {
  general: {
    openers: [
      "hey, how's your week going?",
      "are you around on {day}?",
      "just saw this and thought of you",
      "long time! how have you been?",
      "coffee this week? I owe you one",
      "did you end up going on {day}?",
      "you free for a call later?",
      "happy birthday!! hope it's a good one",
      "running about 10 min late, sorry",
      "what are you up to this weekend",
      "made it home ok?",
      "ok so I have a story for you",
      "guess who I bumped into today",
      "is it just me or has this week been endless",
      "any plans for the long weekend?",
      "hey do you still have my {thing}?",
      "we should do {food} again soon",
      "thinking of you, hope the move is going ok",
    ],
    replies: [
      "haha yes",
      "sounds good, {day} works",
      "omg no way",
      "yeah I'm keen",
      "can't this week, next?",
      "ha, classic",
      "on my way",
      "all good, see you there",
      "let me check and get back to you",
      "that's the one!",
      "same honestly",
      "ok ok you've convinced me",
      "thanks, that means a lot",
      "wait what",
      "I'll bring the {thing}",
      "perfect, {time} then?",
      "ugh, yes",
      "nice one",
      "send me the address?",
      "lol",
      "no rush",
      "sure, {time} is fine",
      "hahaha stop",
      "will do",
      "you're the best",
      "I mean, fair",
      "ok see you {day}",
      "yes please",
      "not sure yet, will let you know",
      "good luck with it!",
    ],
  },
  climbing: {
    openers: [
      "gym on {day}? new set went up",
      "keen for outdoor on the weekend if the weather holds",
      "my forearms are done after last night",
      "did you send the blue one in the end?",
      "we need to book the bus for the trip",
      "anyone got a spare rope tag?",
    ],
    replies: [
      "keen, {time}?",
      "not the blue one, the blue one hates me",
      "rest day for me, next time",
      "that overhang is unreasonable",
      "bringing tape this time",
      "yesss finally sent it",
    ],
  },
  uni: {
    openers: [
      "remember that lecturer who always lost the whiteboard marker",
      "reunion drinks are being planned, you in?",
      "found our old group project, it's worse than I remember",
      "are you still at the same place near campus?",
    ],
    replies: [
      "how is it already that long ago",
      "only if the pub hasn't changed",
      "please tell me you didn't read the whole thing",
      "moved last year, will send the new address",
    ],
  },
  work: {
    openers: [
      "did you see the email about {day}?",
      "lunch? I need to get out of here",
      "how did the presentation go",
      "leaving drinks are on {day} apparently",
      "can you cover my 3pm?",
    ],
    replies: [
      "yep, meet you downstairs",
      "went fine, nobody asked about the numbers",
      "of course, all yours",
      "I'll be there for one",
      "saw it, let's talk tomorrow",
    ],
  },
  family: {
    openers: [
      "are you coming for dinner on {day}?",
      "can you call mum, she's worried about the car",
      "found the old photo albums, you have to see these",
      "what time does your flight get in?",
      "happy anniversary to the parents!",
    ],
    replies: [
      "yes, I'll bring dessert",
      "calling her now",
      "oh no not the haircut years",
      "lands at {time}, don't worry about picking me up",
      "love you, talk soon",
    ],
  },
  footy: {
    openers: [
      "that last quarter, I can't",
      "tips in for this round?",
      "who's coming to the game on {day}",
      "the umpiring was something else",
    ],
    replies: [
      "we were robbed",
      "tipping with my heart, not my head",
      "in, save me a seat",
      "I'm never watching again (see you next week)",
    ],
  },
  books: {
    openers: [
      "has everyone finished the book or is it just me",
      "next month's pick, thoughts?",
      "the ending though",
      "hosting at mine on {day}, bring snacks",
    ],
    replies: [
      "halfway, don't spoil it",
      "something short please",
      "I saw it coming from chapter two",
      "I'll bring the good cheese",
    ],
  },
  travel: {
    openers: [
      "flights booked!! see you at the airport",
      "should we hire a car or wing it?",
      "the hostel has a rooftop apparently",
      "packing list: send",
    ],
    replies: [
      "hire the car, trust me",
      "counting down",
      "I only need a swimsuit and a book",
      "who's on breakfast duty",
    ],
  },
  neighbours: {
    openers: [
      "does anyone know whose cat this is",
      "the bins are on {day} this week, not the usual",
      "street party planning, who's in",
      "package for you got left at mine",
    ],
    replies: [
      "not mine but she visits",
      "thanks for the reminder",
      "in, I'll do the salad",
      "legend, I'll grab it tonight",
    ],
  },
  music: {
    openers: [
      "tickets go on sale {day} at {time}, be ready",
      "that support act was better than the headliner",
      "have you heard the new album",
      "playlist for the drive is done",
    ],
    replies: [
      "alarm set",
      "hard agree",
      "on repeat all week",
      "if it's all your stuff I'm walking",
    ],
  },
  food: {
    openers: [
      "your turn to host, what are we having",
      "I tried that {food} recipe, it's a mess but it's good",
      "new place opened on the corner, we should go",
      "bringing a pav on {day}, don't judge",
    ],
    replies: [
      "something with dumplings",
      "photos or it didn't happen",
      "yes, {time}?",
      "nobody judges a pav",
    ],
  },
  home: {
    openers: [
      "did someone leave the back door open",
      "rent's due {day}, reminder",
      "we're out of dishwasher tablets again",
      "inspection on {day}, hide the plants",
    ],
    replies: [
      "not me",
      "paid",
      "I'll grab some on the way home",
      "the plants are load-bearing at this point",
    ],
  },
  running: {
    openers: [
      "long run {day} morning, 6am at the boathouse",
      "who's got a spare gel",
      "race pack pickup is on {day}",
      "taper week, I'm insufferable",
    ],
    replies: [
      "6am is a crime but ok",
      "I've got two",
      "picked mine up, took 5 min",
      "same",
    ],
  },
  marketplace: {
    openers: ["hi, is this still available?", "could you do a bit less?", "when can I pick it up?"],
    replies: ["yes it is", "sorry, price is firm", "any time after {time} on {day}"],
  },
  request: {
    openers: ["hi! we met at the thing on {day}, this is my number", "hey, long shot, but do you still teach on Tuesdays?", "hello, are you the person selling the bike?"],
    replies: [],
  },
};

/** The slots a line may hold, and what fills them. */
export const FILLS: Readonly<Record<string, readonly string[]>> = {
  day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  time: ["6", "6:30", "7", "7:30", "8", "12:30", "1"],
  food: ["dumplings", "tacos", "pho", "ramen", "pizza", "curry"],
  thing: ["umbrella", "book", "charger", "jacket", "tent", "keys"],
};

export const EMOJI: readonly string[] = ["❤️", "😂", "👍", "😮", "🎉"];
