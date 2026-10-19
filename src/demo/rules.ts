// The demo's own copy of the archive's rules for who is archived
// (server/archive/archiving.ts says what each rule is and why), with the name
// checks they need (server/archive/names.ts) and the size of a small group chat
// (server/archive/stats.ts), so the demo's archive works them out in the page
// with none of the archive's code, which is moving to a project of its own.
// Change them together: the demo parity test
// (server/archive/demoParity.test.ts) checks these answer as the archive's do.

import { ARCHIVE_TAG, KEEP_TAG, type ArchiveReason, type ArchiveRule } from "../archive.ts";

/**
 * The most people, you included, a group chat may have to be small:
 * the archive rules keep everyone in one you wrote in, and the live
 * bridges read only these
 * (see notRead in server/connectors/matrix-bridge/map.ts).
 */
export const SMALL_GROUP_MAX = 12;

/** What the rules read of a person: their messages on every platform, added up (the archive adds it up in SQL; the demo in the page). */
export interface Activity {
  theyDirect: number;
  theyGroup: number;
  youDirect: number;
  /** What you sent in direct chats with them whose source holds only your side (conversation.is_self_only). */
  youDirectSelfOnly: number;
  inDirect: boolean;
  inGroup: boolean;
  inMarketplace: boolean;
  inSmallGroup: boolean;
  allUnknown: boolean;
  allUnnamed: boolean;
}

/**
 * Whether an account has no name, only the address it writes from: a phone
 * number, an email, an SMS short code or sender id ("CommBank", "78787"), or a
 * platform's own id for it (an X, Signal or Discord user id). A connector that
 * finds no name keys such an account on that address and shows it by its key,
 * so an `id`-keyed account shown by its own key has no name; so does any name
 * that is a number or an email by shape, however it is typeset (see plainText
 * below), or an encoded message WhatsApp keeps in a name column
 * ("COC7/7cGIAA=", see isEncodedName).
 * A username or handle a person chose on an internet chat platform (Discord,
 * Telegram, X's "@ada_sample", Signal) is a name: it is never the account's key there
 * (that is the user id), so it is told apart from an address by not being the
 * key, and from a number or an email by its shape.
 * Deleted or unknown accounts are placeholders, not unnamed (the "unknown" rule).
 */
export function isUnnamed(account: { key: string; key_kind: string; display_name: string }): boolean {
  const name = account.display_name.trim();
  if (account.key_kind === "id" && name === account.key) return true;
  return isNumberName(name) || isEncodedName(name) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeHandle(name));
}

/** The first rule that fits what a person did, or null when none does (they have a two-way direct chat, say). */
export function ruleFor(a: Activity | undefined): ArchiveRule | null {
  if (!a) return "no-messages";
  if (a.allUnknown) return "unknown";
  if (a.allUnnamed) return "no-name";
  if (a.theyDirect > 0 && a.youDirect > 0) return null;
  // Where the source cannot hold their side, you writing is all a two-way chat could show.
  if (a.youDirectSelfOnly > 0) return null;
  if (a.inMarketplace && !a.inDirect && !a.inGroup) return "marketplace";
  if (a.theyDirect > 0) return "they-only";
  if (a.youDirect > 0) return "you-only";
  if (a.inSmallGroup) return null;
  if (a.theyGroup > 0) return "groups-wrote";
  if (a.inGroup) return "groups-silent";
  return "no-messages";
}

/**
 * Whether a person is archived, and why: by hand (the "archive" tag), or by a rule,
 * unless they are you, tagged "keep", or edited by you.
 */
export function archiveReason(person: { is_self: number; edited_at: number | null; tags: string[]; archive_rule: string | null }): ArchiveReason | null {
  if (person.is_self) return null;
  if (person.tags.includes(ARCHIVE_TAG)) return "you";
  if (person.tags.includes(KEEP_TAG) || person.edited_at !== null) return null;
  return (person.archive_rule as ArchiveRule | null) ?? null;
}

/**
 * Text with its typesetting undone, to tell what it is by its shape: format and
 * direction marks dropped, every space a plain space and every dash a hyphen.
 * WhatsApp writes a number as "\u202a+54\u00a09\u00a011\u00a00000\u20110001\u202c":
 * wrapped in direction marks, grouped with no-break spaces, with a non-breaking hyphen.
 */
export function plainText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\p{Zs}/gu, " ")
    .replace(/[\p{Pd}\u2212]/gu, "-")
    .trim();
}

/** A name that is only a number, however it is written: "+61 400 000 001", "(03) 9000 0000", "78787". */
export function isNumberName(name: string): boolean {
  const plain = plainText(name);
  return /\d/.test(plain) && /^[+\d\s()[\].\-/]+$/.test(plain);
}

/**
 * A "name" that is data WhatsApp keeps in a name column: a protobuf message
 * written in base64, such as "COC7/7cGIAA=", "CKqC+pYG", "COmDxooG" or "+EAA="
 * (the iPhone app's ZWAMESSAGE.ZPUSHNAME and ZWAGROUPMEMBER.ZFIRSTNAME hold
 * these, the latter with a "+" in front). It is one word of base64, a whole
 * number of four-character groups with a letter in it (so never a phone
 * number), that decodes to a complete protobuf message with a number in it:
 * any number when the word has a digit, "+", "/" or "=", and one of five bytes
 * or more (the time in seconds WhatsApp's carry) when it is letters alone,
 * which by chance only a handful of a quarter of a million dictionary words
 * do. So "Cleo", "Cleo2000" and "+61400000001" are names.
 */
export function isEncodedName(name: string): boolean {
  const text = name.trim().replace(/^\+/, "");
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text) || !/[A-Za-z]/.test(text)) return false;
  const message = protobufOf(Uint8Array.from(atob(text), (char) => char.charCodeAt(0)));
  return message !== null && message.longestNumber >= (/[\d+/=]/.test(text) ? 1 : 5);
}

/**
 * Bytes read as one protobuf message in wire format as an encoder writes it,
 * field after field to the last byte, with the length in bytes of its longest
 * number (a varint field's value); null when they are not one. Field numbers
 * are taken to be under 2048, as WhatsApp's are.
 */
function protobufOf(bytes: Uint8Array): { longestNumber: number } | null {
  let at = 0;
  let longestNumber = 0;
  const varint = (): { value: number; length: number } | null => {
    const from = at;
    let value = 0;
    for (let shift = 0; shift < 70 && at < bytes.length; shift += 7) {
      const byte = bytes[at++];
      value += (byte & 0x7f) * 2 ** shift;
      // An encoder writes no needless zero byte at the end.
      if (byte < 0x80) return byte === 0 && at - from > 1 ? null : { value, length: at - from };
    }
    return null;
  };
  while (at < bytes.length) {
    const tag = varint();
    // A field number from 1 to 2047: a tag of one or two bytes.
    if (tag === null || tag.value < 8 || tag.length > 2) return null;
    const wireType = tag.value % 8;
    if (wireType === 0) {
      const number = varint();
      if (number === null) return null;
      longestNumber = Math.max(longestNumber, number.length);
    } else if (wireType === 1) at += 8;
    else if (wireType === 5) at += 4;
    else if (wireType === 2) {
      const length = varint();
      if (length === null) return null;
      at += length.value;
    } else return null;
    if (at > bytes.length) return null;
  }
  return bytes.length > 0 ? { longestNumber } : null;
}

/**
 * A phone number as E.164 (`+61400000001`), or an email in lowercase. Local
 * Australian numbers (`0400 000 001`) are read as +61, your country.
 * Either may be written with any spaces, dashes and marks (see plainText).
 * Anything else is returned trimmed.
 */
export function normalizeHandle(handle: string): string {
  const plain = plainText(handle);
  if (plain.includes("@")) return plain.toLowerCase();
  const digits = plain.replace(/[\s()[\].\-/]/g, "");
  if (/^\+\d{6,15}$/.test(digits)) return digits;
  if (/^00\d{6,15}$/.test(digits)) return `+${digits.slice(2)}`;
  if (/^0\d{9}$/.test(digits)) return `+61${digits.slice(1)}`;
  return handle.trim();
}
