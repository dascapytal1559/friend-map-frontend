// The demo's archive: the ArchiveApi (archiveApi.ts) over the made-up crowd
// (generate.ts), held in the page itself, with no server. It answers what the
// server's read paths answer (server/archive/structure.ts and content.ts:
// people, the map's report, a person's chats, calls and group chats, a
// query), worked out in memory from the crowd's messages the way the server
// works them out from the archive's tables, with the server's own rules for
// who is archived (ruleFor and archiveReason in server/archive/archiving.ts)
// and the server's own query runner (server/archive/query.ts). Every write is
// refused: the demo is read-only, and says so. The demo has no Table and no
// Calendar, so neither has an answer here. Of the data contract (archive.ts) it
// serves the map, the query language, a person's panel and messages, and scores
// their Events chart itself, as friend-map's server does (DEMO_CONTRACT): it is
// the contract's reference backend, which npm run contract-check -- --demo checks.
//
// The crowd's 700,000 messages are columns (DemoMessages): everything is
// added up from them once, as the page opens, a chat at a time, and a page of
// a chat is found by searching its messages, never by sorting them all.

import {
  ARCHIVE_TAG, BUILT_IN_TAGS, CONTRACT_VERSION, KEEP_TAG, platformsOf, tagsWithRule, type Contract,
  type AccountSummary, type ArchiveRule, type CallDay, type GroupChat, type GroupMember, type GroupMembership, type GroupPerson, type LocationInfo,
  type CatchUp, type MessageCounts, type PeopleListing, type PersonActivity, type PersonCall, type PersonGroup, type PersonRelationship, type PersonSummary,
  type QueryResult, type RelationshipsReport, type TagInfo, type TimelineMessage, type TimelinePage,
} from "../archive.ts";
import { ArchiveError, ArchiveUnavailable, type ArchiveApi, type ChatPage, type TimelineRequest } from "../archiveApi.ts";
import { inOrder } from "../catchUps.ts";
import { personActivity } from "../activity.ts";
import { NAMED_BY } from "../groupName.ts";
import { identiconSeedOf } from "../identicon.ts";
import type { ClosenessSettings } from "../settings.ts";
import { dayKey, dayStart, monthKey, monthRange } from "../time.ts";
import { DEMO_TIME_ZONE } from "./timeZone.ts";
import { isPlaceholderName } from "../names.ts";
import { type QueryPerson, type QueryVocabulary } from "./query.ts";
import { answerInPage, queryPerson, vocabularyOf } from "../pageQuery.ts";
import { archiveReason, isUnnamed, ruleFor, SMALL_GROUP_MAX, type Activity } from "./rules.ts";
import { messageText, type DemoAccount, type DemoConversation, type DemoData, type DemoPersonRecord } from "./generate.ts";

/** The demo's handshake: what of the contract it serves (no Table, Calendar or Time river, and no writes), in the crowd's time zone. */
export const DEMO_CONTRACT: Contract = { version: CONTRACT_VERSION, capabilities: ["map", "query", "panel", "content", "scores"], timeZone: DEMO_TIME_ZONE };

/** A direct message after this many quiet days reopens the conversation (as server/archive/structure.ts counts it). */
const REOPEN_AFTER_DAYS = 14;
const PAGE = 50;
const MAX_PAGE = 5000;

/** What each account did, as import_person_stats keeps it (server/archive/stats.ts). */
interface Stats {
  direct: number;
  group: number;
  marketplace: number;
  last: number | null;
  theyDirect: number;
  youDirect: number;
  inDirect: boolean;
  inGroup: boolean;
  inMarketplace: boolean;
  inSmallGroup: boolean;
}

/** What the map's report works out from the messages, per person (as MessageDerived in structure.ts). */
interface Derived {
  totals: MessageCounts;
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  months: Array<MessageCounts & { month: string }>;
  reactions: { fromMe: number; fromThem: number };
  openings: { byMe: number; byThem: number };
}

/** A group chat's messages added up: how many, yours, the first and last, and each account's. */
interface GroupFacts {
  messageCount: number;
  fromMe: number;
  firstMessageAt: number | null;
  lastMessageAt: number | null;
  sent: Map<number, number>;
}

/** Messages to page through, newest first: a chat's, or some of them (`only`, places in order). */
interface Source {
  start: number;
  count: number;
  only?: Int32Array;
}

/** The read paths over the crowd, worked out once; `api` is what the page uses. */
export class DemoArchive {
  readonly data: DemoData;
  private readonly personById = new Map<number, DemoPersonRecord>();
  private readonly accountsOf = new Map<number, DemoAccount[]>();
  private readonly selfAccount: Uint8Array;
  /** Each group chat's accounts: its listed members, and anyone who wrote there. */
  private readonly groupAccounts = new Map<number, Set<number>>();
  /** The group chats each account is in. */
  private readonly groupsByAccount = new Map<number, number[]>();
  private readonly groupFacts = new Map<number, GroupFacts>();
  /** By account id. */
  private readonly stats: Stats[] = [];
  private readonly summaries = new Map<number, PersonSummary>();
  /** The one-to-one calls (call records), each with the person and account on the other side. */
  private readonly calls: Array<{ index: number; personId: number; accountId: number; seconds: number }> = [];
  private readonly derived: { people: Map<number, Derived>; groups: GroupMembership[]; callDays: CallDay[] };
  private everyoneSorted: PersonSummary[] | null = null;
  /** Each person's own messages in group chats, worked out when first asked for, by person and account. */
  private readonly groupMessagesOf = new Map<string, Source[]>();

  constructor(data: DemoData) {
    this.data = data;
    for (const person of data.people) this.personById.set(person.id, person);
    this.selfAccount = new Uint8Array(data.accounts.length + 1);
    for (const account of data.accounts) {
      if (account.isSelf) this.selfAccount[account.id] = 1;
      this.accountsOf.set(account.personId, [...(this.accountsOf.get(account.personId) ?? []), account]);
    }
    const { sender, sentAt } = data.messages;
    // What each account sent in a group, counted in one array and read back for those that sent anything.
    const sent = new Int32Array(data.accounts.length + 1);
    for (const conversation of data.conversations) {
      if (conversation.type !== "group" || conversation.marketplace) continue;
      const facts: GroupFacts = { messageCount: conversation.count, fromMe: 0, firstMessageAt: null, lastMessageAt: null, sent: new Map() };
      const senders: number[] = [];
      for (let i = conversation.start; i < conversation.start + conversation.count; i++) if (sent[sender[i]]++ === 0) senders.push(sender[i]);
      const accounts = new Set(conversation.memberAccountIds);
      for (const id of senders) {
        accounts.add(id);
        if (this.selfAccount[id]) facts.fromMe += sent[id];
        else facts.sent.set(id, sent[id]);
        sent[id] = 0;
      }
      if (conversation.count > 0) [facts.firstMessageAt, facts.lastMessageAt] = [sentAt[conversation.start], sentAt[conversation.start + conversation.count - 1]];
      this.groupAccounts.set(conversation.id, accounts);
      this.groupFacts.set(conversation.id, facts);
      for (const id of accounts) (this.groupsByAccount.get(id) ?? this.groupsByAccount.set(id, []).get(id)!).push(conversation.id);
    }
    this.countStats();
    this.derived = this.derive();
    for (const person of data.people) this.summaries.set(person.id, this.summarise(person));
  }

  private account(id: number): DemoAccount {
    return this.data.accounts[id - 1];
  }

  private conversationOf(id: number): DemoConversation | undefined {
    return this.data.conversations[id - 1];
  }

  /** Each group's size, you included (server/archive/stats.ts). */
  private groupSize(conversationId: number): number {
    return this.groupAccounts.get(conversationId)?.size ?? 0;
  }

  private countStats(): void {
    const { sender, sentAt } = this.data.messages;
    for (const account of this.data.accounts) {
      this.stats[account.id] = { direct: 0, group: 0, marketplace: 0, last: null, theyDirect: 0, youDirect: 0, inDirect: false, inGroup: false, inMarketplace: false, inSmallGroup: false };
    }
    for (const conversation of this.data.conversations) {
      const { start, count } = conversation;
      let mine = 0;
      for (let i = start; i < start + count; i++) if (this.selfAccount[sender[i]]) mine++;
      const last = count > 0 ? sentAt[start + count - 1] : null;
      const group = conversation.type === "group" && !conversation.marketplace;
      for (const id of group ? this.groupAccounts.get(conversation.id)! : conversation.memberAccountIds) {
        const stats = this.stats[id];
        const self = this.selfAccount[id] === 1;
        if (conversation.marketplace) {
          stats.inMarketplace = true;
          if (!self) stats.marketplace += count;
        } else if (conversation.type === "direct") {
          stats.inDirect = true;
          if (!self) {
            stats.direct += count;
            stats.youDirect += mine;
            if (last !== null) stats.last = Math.max(stats.last ?? 0, last);
          }
        } else {
          stats.inGroup = true;
          if (mine > 0 && this.groupSize(conversation.id) <= SMALL_GROUP_MAX) stats.inSmallGroup = true;
        }
      }
      if (conversation.marketplace) continue;
      for (let i = start; i < start + count; i++) {
        const stats = this.stats[sender[i]];
        if (conversation.type === "direct") stats.theyDirect++;
        else {
          stats.group++;
          stats.last = Math.max(stats.last ?? 0, sentAt[i]);
        }
      }
    }
  }

  /** The rule that archives a person, from what their accounts did (as archiveRules in archiving.ts adds it up). */
  private ruleOf(person: DemoPersonRecord): ArchiveRule | null {
    const accounts = this.accountsOf.get(person.id) ?? [];
    if (accounts.length === 0) return ruleFor(undefined);
    const activity: Activity = { theyDirect: 0, theyGroup: 0, youDirect: 0, youDirectSelfOnly: 0, inDirect: false, inGroup: false, inMarketplace: false, inSmallGroup: false, allUnknown: true, allUnnamed: true };
    for (const account of accounts) {
      const stats = this.stats[account.id];
      if (!isPlaceholderName(account.displayName)) {
        activity.allUnknown = false;
        if (!isUnnamed({ key: account.displayName, key_kind: "name", display_name: account.displayName })) activity.allUnnamed = false;
      }
      activity.theyDirect += stats.theyDirect;
      activity.theyGroup += stats.group;
      activity.youDirect += stats.youDirect;
      activity.inDirect ||= stats.inDirect;
      activity.inGroup ||= stats.inGroup;
      activity.inMarketplace ||= stats.inMarketplace;
      activity.inSmallGroup ||= stats.inSmallGroup;
    }
    return ruleFor(activity);
  }

  private summarise(person: DemoPersonRecord): PersonSummary {
    const accounts = (this.accountsOf.get(person.id) ?? [])
      .map((account): AccountSummary & { marketplace: number } => {
        const stats = this.stats[account.id];
        return {
          id: account.id, platform: account.platform, displayName: account.displayName, handle: account.handle, link: "import",
          messageCount: stats.direct + stats.group, directMessageCount: stats.direct, groupMessageCount: stats.group, lastMessageAt: stats.last,
          marketplace: stats.marketplace,
        };
      })
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
    const lastByPlatform = new Map<string, number>();
    for (const account of accounts) {
      if (account.lastMessageAt !== null && account.lastMessageAt > (lastByPlatform.get(account.platform) ?? -Infinity)) lastByPlatform.set(account.platform, account.lastMessageAt);
    }
    const sum = (pick: (a: (typeof accounts)[number]) => number) => accounts.reduce((n, a) => n + pick(a), 0);
    const rule = person.isSelf ? null : this.ruleOf(person);
    const last = [...lastByPlatform.values()];
    // Tags in the tag table's order, as the server lists them.
    const order = new Map(this.data.tags.map((tag, i) => [tag, i]));
    return {
      id: person.id,
      name: person.name,
      aliases: person.aliases,
      tags: [...person.tags].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity)),
      note: person.note,
      noteFromContacts: false,
      shouldReachOut: person.shouldReachOut,
      identiconSeed: identiconSeedOf(person.id, 0),
      identiconHue: null,
      location: person.location,
      edited: person.edited,
      // The crowd has no "Not them" and links nobody by hand but those it counts as edited (generate.ts), so untouched is not edited.
      untouched: !person.isSelf && !person.edited,
      archived: archiveReason({ is_self: person.isSelf ? 1 : 0, edited_at: person.edited ? this.data.now : null, tags: person.tags, archive_rule: rule }),
      archiveRule: rule,
      accounts: accounts.map(({ marketplace: _m, ...account }) => account),
      messageCount: sum((a) => a.messageCount),
      directMessageCount: sum((a) => a.directMessageCount),
      groupMessageCount: sum((a) => a.groupMessageCount),
      marketplaceMessageCount: sum((a) => a.marketplace),
      lastMessageAt: last.length > 0 ? Math.max(...last) : null,
      unknown: accounts.length > 0 && accounts.every((a) => isPlaceholderName(a.displayName)),
      lastByPlatform: [...lastByPlatform].map(([platform, at]) => ({ platform, at })).sort((a, b) => b.at - a.at),
      joined: null,
    };
  }

  /** Everyone but you, newest conversation first (as the server lists them). */
  private everyone(): PersonSummary[] {
    return (this.everyoneSorted ??= [...this.summaries.values()]
      .filter((person) => person.id !== this.data.selfPersonId)
      .sort((a, b) => (b.lastMessageAt ?? -1) - (a.lastMessageAt ?? -1) || a.name.localeCompare(b.name)));
  }

  /**
   * What the messages add up to per person and per group chat, as the server's map report works it out (a call in a
   * one-to-one chat counting as a call, not a message), and the days with calls (as calls.ts adds them up).
   */
  private derive(): { people: Map<number, Derived>; groups: GroupMembership[]; callDays: CallDay[] } {
    const { sender, sentAt, calls, reactions } = this.data.messages;
    type Entry = Derived & { id: number; monthly: Map<number, MessageCounts>; month: number; counts: MessageCounts | null };
    const people = new Map<number, Entry>();
    for (const person of this.data.people) {
      if (person.isSelf) continue;
      people.set(person.id, { id: person.id, totals: emptyCounts(), firstMessageAt: null, lastMessageAt: null, months: [], reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 }, monthly: new Map(), month: -1, counts: null });
    }
    // Each account's person (your accounts none), and which messages are calls, read by place.
    const entryOf: Array<Entry | undefined> = this.data.accounts.map(() => undefined);
    for (const account of this.data.accounts) if (!account.isSelf) entryOf[account.id] = people.get(account.personId);
    const isCall = new Uint8Array(this.data.messages.length);
    for (const i of calls.keys()) isCall[i] = 1;
    // Melbourne months from the first message to now, so a message's month is found by counting on, not by formatting its date.
    let earliest = this.data.now;
    for (const c of this.data.conversations) if (c.count > 0) earliest = Math.min(earliest, sentAt[c.start]);
    const monthKeys = monthRange(monthKey(earliest), monthKey(this.data.now));
    const monthStarts = monthKeys.map((month) => dayStart(`${month}-01`));
    const monthOf = (at: number) => {
      let [low, high] = [0, monthStarts.length - 1];
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (monthStarts[middle] <= at) low = middle;
        else high = middle - 1;
      }
      return low;
    };
    /** Someone's counts for a month (the last asked for kept at hand: their messages come a month at a time). */
    const countsOf = (entry: Entry, month: number) => {
      if (entry.month !== month) {
        entry.month = month;
        entry.counts = entry.monthly.get(month) ?? entry.monthly.set(month, emptyCounts()).get(month)!;
      }
      return entry.counts!;
    };
    const dated = (entry: Entry, at: number) => {
      if (entry.firstMessageAt === null || at < entry.firstMessageAt) entry.firstMessageAt = at;
      if (entry.lastMessageAt === null || at > entry.lastMessageAt) entry.lastMessageAt = at;
    };

    // One-to-one chats, each person's in time order across their chats (so a chat picked up again on another platform
    // after a quiet spell is an opening).
    const directOf = new Map<Entry, DemoConversation[]>();
    for (const conversation of this.data.conversations) {
      if (conversation.type !== "direct" || conversation.marketplace) continue;
      for (const id of conversation.memberAccountIds) {
        const entry = entryOf[id];
        if (entry) (directOf.get(entry) ?? directOf.set(entry, []).get(entry)!).push(conversation);
      }
    }
    const gap = REOPEN_AFTER_DAYS * 86_400_000;
    for (const [entry, chats] of directOf) {
      let lastDirect: number | null = null;
      let month = -1;
      let next = -Infinity;
      for (const i of inTimeOrder(chats, sentAt)) {
        if (isCall[i]) continue;
        const at = sentAt[i];
        if (at >= next) {
          month = monthOf(at);
          next = monthStarts[month + 1] ?? Infinity;
        }
        const field = this.selfAccount[sender[i]] ? "directFromMe" : "directFromThem";
        entry.totals[field]++;
        countsOf(entry, month)[field]++;
        dated(entry, at);
        if (lastDirect !== null && at - lastDirect >= gap) entry.openings[field === "directFromMe" ? "byMe" : "byThem"]++;
        lastDirect = at;
      }
    }

    // Group chats. What you say there counts for everyone in it, which is added up by month afterwards.
    const groups: GroupMembership[] = [];
    for (const conversation of this.data.conversations) {
      if (conversation.type !== "group" || conversation.marketplace) continue;
      const members = new Set<Entry>();
      for (const id of conversation.memberAccountIds) {
        const entry = entryOf[id];
        if (entry) members.add(entry);
      }
      const months = new Map<number, { messages: number; fromMe: number; fromMembers: Map<number, number> }>();
      let month = -1;
      let next = -Infinity;
      let inMonth = { messages: 0, fromMe: 0, fromMembers: new Map<number, number>() };
      for (let i = conversation.start; i < conversation.start + conversation.count; i++) {
        const at = sentAt[i];
        if (at >= next) {
          month = monthOf(at);
          next = monthStarts[month + 1] ?? Infinity;
          inMonth = months.get(month) ?? months.set(month, { messages: 0, fromMe: 0, fromMembers: new Map() }).get(month)!;
        }
        inMonth.messages++;
        if (this.selfAccount[sender[i]]) inMonth.fromMe++;
        else {
          const entry = entryOf[sender[i]];
          if (entry) {
            entry.totals.groupFromThem++;
            countsOf(entry, month).groupFromThem++;
            dated(entry, at);
            inMonth.fromMembers.set(entry.id, (inMonth.fromMembers.get(entry.id) ?? 0) + 1);
          }
        }
      }
      for (const [m, { fromMe }] of months) {
        if (fromMe === 0) continue;
        for (const entry of members) {
          entry.totals.groupFromMe += fromMe;
          countsOf(entry, m).groupFromMe += fromMe;
        }
      }
      if (members.size === 0) continue;
      const facts = this.groupFacts.get(conversation.id)!;
      groups.push({
        id: conversation.id,
        memberIds: [...members].map((entry) => entry.id).sort((a, b) => a - b),
        selfOnly: false,
        messageCount: facts.messageCount,
        lastMessageAt: facts.lastMessageAt,
        months: [...months].sort(([a], [b]) => a - b).map(([m, counts]) => ({
          month: monthKeys[m], messages: counts.messages, fromMe: counts.fromMe, fromMembers: [...counts.fromMembers].sort(([a], [b]) => a - b).map(([id, n]) => ({ id, count: n })),
        })),
      });
    }
    for (const entry of people.values()) entry.months = [...entry.monthly].sort(([a], [b]) => a - b).map(([m, counts]) => ({ month: monthKeys[m], ...counts }));

    // Reactions between you and someone, in any chat but a Marketplace one, on anything but a call.
    for (const [i, list] of reactions) {
      const conversation = this.conversationOf(this.data.messages.conversation[i])!;
      if (conversation.marketplace || isCall[i]) continue;
      const fromMe = this.selfAccount[sender[i]] === 1;
      for (const reaction of list) {
        if (this.selfAccount[reaction.actorAccountId]) {
          const them = fromMe ? undefined : entryOf[sender[i]];
          if (them) them.reactions.fromMe++;
        } else if (fromMe) {
          const them = entryOf[reaction.actorAccountId];
          if (them) them.reactions.fromThem++;
        }
      }
    }

    // Calls in one-to-one chats, with the person on the other side; the answered ones' seconds by person and day.
    for (const conversation of this.data.conversations) {
      if (conversation.type !== "direct" || conversation.marketplace) continue;
      for (let i = conversation.start; i < conversation.start + conversation.count; i++) {
        const seconds = calls.get(i);
        if (seconds === undefined) continue;
        for (const id of conversation.memberAccountIds) {
          const account = this.account(id);
          if (!account.isSelf && !this.personById.get(account.personId)!.isSelf) this.calls.push({ index: i, personId: account.personId, accountId: id, seconds });
        }
      }
    }
    this.calls.sort((a, b) => sentAt[a.index] - sentAt[b.index] || a.index - b.index);
    const days = new Map<string, CallDay>();
    for (const call of this.calls) {
      if (call.seconds <= 0) continue;
      const day = dayKey(sentAt[call.index]);
      const key = `${call.personId}:${day}`;
      (days.get(key) ?? days.set(key, { personId: call.personId, day, seconds: 0 }).get(key)!).seconds += call.seconds;
    }
    return { people, groups: groups.sort((a, b) => b.messageCount - a.messageCount || a.id - b.id), callDays: [...days.values()] };
  }

  /** What a query runs over, and what there is to ask for (as structure.queryable). */
  queryable(): { people: QueryPerson[]; vocabulary: QueryVocabulary } {
    const people = this.everyone().map(queryPerson);
    const groups = this.data.conversations.filter((c) => c.type === "group" && !c.marketplace);
    return {
      people,
      vocabulary: vocabularyOf(people, {
        tags: this.data.tags,
        locations: this.locations().map((v) => v.name),
        groups: {
          list: groups.map((c) => ({ id: c.id, title: c.title })),
          members: (ids) => new Set(ids.flatMap((id) => this.groupMembers(id).map((m) => m.id))),
        },
      }),
    };
  }

  /** Everyone a query matches, and how many Hide shows; a QueryError as the server would answer it (400, with its words). */
  runQuery(q: string, hide: readonly string[] = []): QueryResult {
    const { people, vocabulary } = this.queryable();
    return answerInPage(q, hide, people, vocabulary, "SQL runs only in the app, over its archive; the demo takes the query language.");
  }

  /** The map's report: everyone on the map, and with `reveal`, the archived people the query matches. */
  relationships(q = "", reveal = false): RelationshipsReport {
    let revealed = new Set<number>();
    if (reveal) {
      let matched: Set<number>;
      try {
        matched = new Set(this.runQuery(q).ids);
      } catch (error) {
        if (!(error instanceof ArchiveError)) throw error;
        matched = new Set();
      }
      revealed = new Set(this.everyone()
        .filter((person) => person.archived !== null && matched.has(person.id))
        .map((person) => person.id));
    }
    const everyone = this.everyone();
    return {
      generatedAt: this.data.now,
      gapDays: REOPEN_AFTER_DAYS,
      archivedCount: everyone.filter((person) => person.archived !== null).length,
      people: everyone.filter((person) => person.archived === null || revealed.has(person.id)).map((person): PersonRelationship => {
        const derived = this.derived.people.get(person.id);
        return {
          id: person.id,
          totals: derived?.totals ?? emptyCounts(),
          firstMessageAt: derived?.firstMessageAt ?? null,
          lastMessageAt: derived?.lastMessageAt ?? null,
          months: derived?.months ?? [],
          reactions: derived?.reactions ?? { fromMe: 0, fromThem: 0 },
          openings: derived?.openings ?? { byMe: 0, byThem: 0 },
          name: person.name,
          aliases: person.aliases,
          tags: tagsWithRule(person),
          note: person.note,
          shouldReachOut: person.shouldReachOut,
          identiconSeed: person.identiconSeed,
          identiconHue: person.identiconHue,
          location: person.location,
          unknown: person.unknown,
          platforms: platformsOf(person.accounts),
        };
      }),
      groups: this.derived.groups,
      // The demo is read-only, so nobody is unlinked from a group.
      unlinks: [],
      catchUps: this.scoredCatchUps(),
      callDays: this.derived.callDays,
    };
  }

  listPeople(): PeopleListing {
    const people = this.everyone();
    const counts = new Map<string, number>();
    for (const person of people) for (const tag of person.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return {
      people,
      me: this.summaries.get(this.data.selfPersonId) ?? null,
      tags: this.data.tags.filter((tag) => counts.has(tag)).map((tag) => ({ tag, count: counts.get(tag)! })),
    };
  }

  person(id: number): PersonSummary | null {
    return this.summaries.get(id) ?? null;
  }

  tagList(): TagInfo[] {
    const counts = new Map<string, number>();
    for (const person of this.everyone()) for (const tag of person.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return this.data.tags.map((name) => ({ name, count: counts.get(name) ?? 0, builtIn: BUILT_IN_TAGS.includes(name) }));
  }

  locations(): LocationInfo[] {
    const counts = new Map<string, number>();
    for (const person of this.everyone()) if (person.location) counts.set(person.location, (counts.get(person.location) ?? 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /** Every catch-up (or only those `personId` was at), the latest first, each with everyone at it A to Z, as the server lists them. */
  catchUps(personId?: number): CatchUp[] {
    return this.data.catchUps
      .filter((c) => personId === undefined || c.personIds.includes(personId))
      .sort((a, b) => inOrder(b, a))
      .map(({ id, day, time, trip, hours, byCall, note, personIds, others }) => ({
        id, day, time, trip, hours, byCall, note, others,
        people: personIds
          .map((pid) => this.personById.get(pid)!)
          .sort((a, b) => nocase(a.name, b.name) || a.id - b.id)
          .map((p) => ({ id: p.id, name: p.name, aliases: p.aliases })),
      }));
  }

  /** The catch-ups for the closeness score, oldest first. */
  private scoredCatchUps() {
    return this.data.catchUps.map(({ id, day, time, trip, hours, byCall, others, personIds }) => ({ id, day, time, trip, hours, byCall, others, personIds }));
  }

  activity(id: number, settings: ClosenessSettings): PersonActivity | null {
    if (!this.summaries.has(id)) return null;
    const people = [...this.derived.people].map(([id, p]) => ({ id, months: p.months }));
    return personActivity({ generatedAt: this.data.now, people, groups: this.derived.groups, catchUps: this.scoredCatchUps(), callDays: this.derived.callDays }, id, settings);
  }

  /** A person's calls, newest first, as the server lists them (calls.ts callsOf); with `accountId`, only that account's of theirs. */
  callsOf(personId: number, accountId?: number): PersonCall[] {
    const { sender, sentAt } = this.data.messages;
    return this.calls
      .filter((call) => call.personId === personId && (accountId === undefined || call.accountId === accountId))
      .reverse()
      .map(({ index, accountId: account, seconds }): PersonCall => ({
        id: index + 1, platform: this.account(account).platform, messageId: index + 1, manual: false, accountId: account, at: sentAt[index],
        durationSeconds: seconds, direction: this.selfAccount[sender[index]] ? "outgoing" : "incoming", answered: seconds > 0, service: null, group: null, people: 1, others: 0,
        note: "",
      }));
  }

  /** Everyone in a group chat but you, as people, with what each sent there: the most first, then by name. */
  private groupMembers(conversationId: number): Array<GroupPerson & { messages: number }> {
    const sent = new Map<number, number>();
    for (const [accountId, n] of this.groupFacts.get(conversationId)?.sent ?? []) {
      const personId = this.account(accountId).personId;
      sent.set(personId, (sent.get(personId) ?? 0) + n);
    }
    const people = new Map<number, GroupPerson & { messages: number }>();
    for (const accountId of this.groupAccounts.get(conversationId) ?? []) {
      const account = this.account(accountId);
      if (account.isSelf || people.has(account.personId)) continue;
      const person = this.personById.get(account.personId)!;
      people.set(person.id, { id: person.id, name: person.name, aliases: person.aliases, messages: sent.get(person.id) ?? 0 });
    }
    return [...people.values()].sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name) || a.id - b.id);
  }

  private facts(conversation: DemoConversation) {
    const { fromMe, messageCount, firstMessageAt, lastMessageAt } = this.groupFacts.get(conversation.id)!;
    return { fromMe, messageCount, firstMessageAt, lastMessageAt };
  }

  groupsOf(personId: number): PersonGroup[] | null {
    if (!this.summaries.has(personId)) return null;
    const mine = (this.accountsOf.get(personId) ?? []).map((a) => a.id);
    const ids = [...new Set(mine.flatMap((id) => this.groupsByAccount.get(id) ?? []))];
    return ids
      .map((id): PersonGroup => {
        const c = this.conversationOf(id)!;
        const facts = this.facts(c);
        const sent = this.groupFacts.get(id)!.sent;
        return {
          id: c.id, title: c.title, platform: c.platform, people: this.groupSize(c.id),
          fromThem: mine.reduce((n, account) => n + (sent.get(account) ?? 0), 0), fromMe: facts.fromMe, lastMessageAt: facts.lastMessageAt,
          namedBy: c.title === null ? this.groupMembers(c.id).slice(0, NAMED_BY).map(({ id, name, aliases }) => ({ id, name, aliases })) : [],
          // The demo is read-only, so nobody is unlinked from a group.
          unlinked: false,
        };
      })
      .sort((a, b) => (b.lastMessageAt ?? -Infinity) - (a.lastMessageAt ?? -Infinity) || a.id - b.id);
  }

  group(id: number): GroupChat | null {
    const conversation = this.conversationOf(id);
    if (!conversation || conversation.type !== "group" || conversation.marketplace) return null;
    const members = this.groupMembers(id).map((member): GroupMember => {
      const { untouched, archived } = this.summaries.get(member.id)!;
      return { ...member, untouched, archived: archived !== null };
    });
    return { id, title: conversation.title, platform: conversation.platform, people: this.groupSize(id), members, ...this.facts(conversation) };
  }

  private toTimelineMessage(index: number): TimelineMessage {
    const { messages } = this.data;
    const conversation = this.conversationOf(messages.conversation[index])!;
    const sender = this.account(messages.sender[index]);
    const call = messages.calls.get(index);
    return {
      id: index + 1,
      platform: conversation.platform,
      conversation: { id: conversation.id, type: conversation.type, title: conversation.title, marketplace: conversation.marketplace },
      sentAt: messages.sentAt[index],
      fromSelf: sender.isSelf,
      sender: sender.displayName,
      type: call === undefined ? "text" : "call",
      text: call === undefined ? messageText(this.data, index) : null,
      unsent: false,
      callSeconds: call ?? null,
      callLengthGiven: false,
      callNote: "",
      callAnswer: null,
      attachments: [],
      reactions: (messages.reactions.get(index) ?? []).map((r) => ({ emoji: r.emoji, actor: this.account(r.actorAccountId).displayName })),
    };
  }

  /**
   * A page of `sources` together, newest first, as the server pages a chat: from `before` (sentAt:id), or the `limit`
   * just newer than `after` with where the next newer page starts, `limit` long, `total` with `count`. Each source is
   * searched for where the page starts, and they are merged from there.
   */
  private page(sources: Source[], { before, after, limit, count }: ChatPage): TimelinePage {
    const { sentAt } = this.data.messages;
    const size = limit === undefined || !Number.isFinite(limit) ? PAGE : Math.min(MAX_PAGE, Math.max(1, Math.floor(limit)));
    const newer = after !== undefined;
    const cursor = (newer ? after : before) ? /^(-?\d+):(\d+)$/.exec((newer ? after : before)!) : null;
    const at = (source: Source, k: number) => (source.only ? source.only[k] : source.start + k);
    // At or older than the cursor (older alone, paging back): sentAt before it, or the same and an earlier id (a place one less).
    const older = (i: number) =>
      !cursor ? !newer : sentAt[i] < Number(cursor[1]) || (sentAt[i] === Number(cursor[1]) && (newer ? i + 1 <= Number(cursor[2]) : i + 1 < Number(cursor[2])));
    // How many of each source are older than the cursor: they come in order, so the first that is not is found by search.
    const left = sources.map((source) => {
      let [low, high] = [0, source.count];
      while (low < high) {
        const middle = (low + high) >> 1;
        if (older(at(source, middle))) low = middle + 1;
        else high = middle;
      }
      return low;
    });
    const page: number[] = [];
    while (page.length < size) {
      let best = -1;
      for (let s = 0; s < sources.length; s++) {
        // Paging back takes each source's newest older one; paging on, its oldest newer one.
        if (newer ? left[s] === sources[s].count : left[s] === 0) continue;
        if (best < 0) {
          best = s;
          continue;
        }
        const [i, j] = newer ? [at(sources[s], left[s]), at(sources[best], left[best])] : [at(sources[s], left[s] - 1), at(sources[best], left[best] - 1)];
        const later = sentAt[i] > sentAt[j] || (sentAt[i] === sentAt[j] && i > j);
        if (newer ? !later : later) best = s;
      }
      if (best < 0) break;
      page.push(newer ? at(sources[best], left[best]++) : at(sources[best], --left[best]));
    }
    const counted = count ? { total: sources.reduce((n, source) => n + source.count, 0) } : {};
    if (newer) {
      const newest = page.at(-1);
      return {
        messages: page.reverse().map((i) => this.toTimelineMessage(i)),
        nextBefore: null,
        nextAfter: newest !== undefined && left.some((n, s) => n < sources[s].count) ? `${sentAt[newest]}:${newest + 1}` : null,
        ...counted,
      };
    }
    const last = page.at(-1);
    return {
      messages: page.map((i) => this.toTimelineMessage(i)),
      nextBefore: last !== undefined && left.some((n) => n > 0) ? `${sentAt[last]}:${last + 1}` : null,
      ...counted,
    };
  }

  timeline(personId: number, options: TimelineRequest = {}): TimelinePage | null {
    if (!this.summaries.has(personId)) return null;
    const mine = new Set((this.accountsOf.get(personId) ?? []).map((a) => a.id).filter((id) => options.account === undefined || id === options.account));
    if (mine.size === 0 && options.account !== undefined) return null;
    const sources: Source[] = [];
    for (const conversation of this.data.conversations) {
      if (conversation.type !== "direct" || (conversation.marketplace && !options.marketplace)) continue;
      if (conversation.memberAccountIds.some((id) => mine.has(id))) sources.push({ start: conversation.start, count: conversation.count });
    }
    if (options.groups) sources.push(...this.groupMessages(personId, mine, options.account));
    return this.page(sources, options);
  }

  /** What `accounts` (of `personId`) said in group chats: a source for each group, worked out once. */
  private groupMessages(personId: number, accounts: ReadonlySet<number>, account?: number): Source[] {
    const key = `${personId}:${account ?? ""}`;
    let sources = this.groupMessagesOf.get(key);
    if (!sources) {
      const { sender } = this.data.messages;
      sources = [];
      for (const id of new Set([...accounts].flatMap((a) => this.groupsByAccount.get(a) ?? []))) {
        const c = this.conversationOf(id)!;
        const only: number[] = [];
        for (let i = c.start; i < c.start + c.count; i++) if (accounts.has(sender[i])) only.push(i);
        if (only.length > 0) sources.push({ start: c.start, count: only.length, only: Int32Array.from(only) });
      }
      this.groupMessagesOf.set(key, sources);
    }
    return sources;
  }

  conversation(conversationId: number, options: ChatPage = {}): TimelinePage {
    const conversation = this.conversationOf(conversationId);
    return this.page(conversation ? [{ start: conversation.start, count: conversation.count }] : [], options);
  }

  /** The archive as the page uses it. */
  get api(): ArchiveApi {
    const readOnly = () => Promise.reject(new ArchiveError("refused (403): the demo is read-only", "This is a demo of made-up people: nothing here can be changed."));
    const notHere = (what: string) => () => Promise.reject(new ArchiveUnavailable(`GET ${what} failed (404): not in the demo`, `${what} is not part of the demo`));
    const found = <T>(value: T | null, what: string): Promise<T> =>
      value === null ? Promise.reject(new ArchiveUnavailable(`GET ${what} failed (404): no such ${what}`, `no such ${what}`)) : Promise.resolve(value);
    return {
      contract: () => Promise.resolve(DEMO_CONTRACT),
      people: () => Promise.resolve(this.listPeople()),
      person: (id) => found(this.person(id), "person"),
      addPerson: readOnly, setNames: readOnly, setTags: readOnly, setNote: readOnly, setShouldReachOut: readOnly,
      drafts: () => Promise.resolve([]), addDraft: readOnly, setDraft: readOnly,
      setLocation: readOnly, setIdenticon: readOnly, join: readOnly, detach: readOnly, createTag: readOnly, renameTag: readOnly, moveTag: readOnly,
      deleteTag: readOnly, confirm: readOnly, reject: readOnly, undoChange: readOnly, archiveUntouched: readOnly, send: readOnly,
      setGroupUnlinked: readOnly,
      tags: () => Promise.resolve(this.tagList()),
      locations: () => Promise.resolve(this.locations()),
      proposals: () => Promise.resolve([]),
      changes: () => Promise.resolve([]),
      changeset: notHere("changes"),
      relationships: (q, reveal) => Promise.resolve(this.relationships(q, reveal)),
      // The demo has no Table, no Calendar and no Time river.
      table: notHere("table"),
      messageApps: notHere("message apps"),
      calendarMonth: notHere("calendar"),
      calendarDay: notHere("calendar"),
      dayMessages: notHere("calendar"),
      catchUps: (personId) => Promise.resolve(this.catchUps(personId)),
      calls: (personId, accountId) => Promise.resolve(this.callsOf(personId, accountId)),
      addCatchUp: readOnly, changeCatchUp: readOnly, deleteCatchUp: readOnly, setCallLength: readOnly,
      addCall: readOnly, loggedCall: notHere("logged call"), changeCall: readOnly, deleteCall: readOnly,
      callToCatchUp: readOnly, catchUpToCall: readOnly,
      listCalls: notHere("calls"), setCallNote: readOnly, setCallAnswered: readOnly,
      sendTargets: () => Promise.resolve([]),
      activity: (id, settings) => found(this.activity(id, settings), "person"),
      groups: (id) => found(this.groupsOf(id), "person"),
      group: (id) => found(this.group(id), "group chat"),
      query: (q, hide) => {
        try {
          return Promise.resolve(this.runQuery(q, hide));
        } catch (error) {
          return Promise.reject(error);
        }
      },
      generateQuery: () => Promise.reject(new ArchiveError("refused (409): no model", "The demo has no model to write queries: pick an example instead.")),
      // Nothing here changes.
      follow: () => () => {},
      timeline: (id, page) => found(this.timeline(id, page), "person"),
      conversation: (id, page) => Promise.resolve(this.conversation(id, page)),
      attachmentUrl: () => "",
    };
  }
}

/** Two names in SQLite's NOCASE order (ASCII letters folded), as the server sorts them. */
function nocase(a: string, b: string): number {
  const fold = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const [x, y] = [fold(a), fold(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The places of `chats`' messages, all of them, oldest first (each chat's already are): one chat, or several merged. */
function* inTimeOrder(chats: readonly DemoConversation[], sentAt: Float64Array): Generator<number> {
  if (chats.length === 1) {
    for (let i = chats[0].start; i < chats[0].start + chats[0].count; i++) yield i;
    return;
  }
  const next = chats.map((c) => c.start);
  for (;;) {
    let best = -1;
    for (let c = 0; c < chats.length; c++) {
      if (next[c] >= chats[c].start + chats[c].count) continue;
      if (best < 0 || sentAt[next[c]] < sentAt[next[best]] || (sentAt[next[c]] === sentAt[next[best]] && next[c] < next[best])) best = c;
    }
    if (best < 0) return;
    yield next[best]++;
  }
}

function emptyCounts(): MessageCounts {
  return { directFromMe: 0, directFromThem: 0, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 };
}
