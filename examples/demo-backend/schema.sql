-- What the demo backend holds: one SQLite file, made by seed.ts from the demo's made-up crowd, read and changed by
-- server.ts. These are the facts a backend keeps; every answer friend-map asks for is counted from them (docs/contract.md).

-- The handshake's time zone ('time-zone'), and when the crowd was made ('seeded-at').
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Everyone, you among them (is_you = 1): the owner of the map, the sun at its centre.
CREATE TABLE people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',         -- a JSON array of other names
  note TEXT NOT NULL DEFAULT '',
  location TEXT,
  should_reach_out INTEGER NOT NULL DEFAULT 0,
  identicon_seed TEXT NOT NULL,
  identicon_hue INTEGER,                      -- whole degrees, or NULL for the seed's own
  is_you INTEGER NOT NULL DEFAULT 0,
  -- Why the backend's own rule takes them off the map (an ArchiveRule: 'groups-silent', 'no-name'...), or NULL.
  -- The tags 'archive' and 'keep', and any change you make to them, win over it (archivedOf in people.ts).
  archive_rule TEXT,
  edited INTEGER NOT NULL DEFAULT 0,          -- changed by you since the seed
  added_at INTEGER NOT NULL                   -- ms since the epoch
);

-- Your tags, in your order. A tag nobody has is still a tag.
CREATE TABLE tags (
  name TEXT PRIMARY KEY,
  position INTEGER NOT NULL
);

CREATE TABLE person_tags (
  person_id INTEGER NOT NULL REFERENCES people (id),
  tag TEXT NOT NULL REFERENCES tags (name) ON UPDATE CASCADE,
  PRIMARY KEY (person_id, tag)
);

-- One person's account on one platform; a person may have several.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people (id),
  platform TEXT NOT NULL,                     -- 'signal', 'whatsapp', 'sms'...
  display_name TEXT NOT NULL,
  handle TEXT
);
CREATE INDEX accounts_by_person ON accounts (person_id);

-- A chat: one-to-one ('direct', you and one account) or a group chat.
CREATE TABLE chats (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  title TEXT                                  -- a group chat's name, if it has one
);

-- Who is in each chat, by account, yours too.
CREATE TABLE chat_members (
  chat_id INTEGER NOT NULL REFERENCES chats (id),
  account_id INTEGER NOT NULL REFERENCES accounts (id),
  PRIMARY KEY (chat_id, account_id)
);
CREATE INDEX chat_members_by_account ON chat_members (account_id);

-- Every message, and every call record in a one-to-one chat (call_seconds: how long it was connected, 0 for one never
-- answered). Its day is kept as the backend's time zone reads it, so days and months are a GROUP BY away.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats (id),
  sender_id INTEGER NOT NULL REFERENCES accounts (id),
  sent_at INTEGER NOT NULL,                   -- ms since the epoch
  day TEXT NOT NULL,                          -- YYYY-MM-DD, local
  text TEXT,                                  -- NULL for a call
  call_seconds INTEGER
);
CREATE INDEX messages_by_chat ON messages (chat_id, sent_at, id);
CREATE INDEX messages_by_sender ON messages (sender_id, sent_at);
CREATE INDEX messages_by_day ON messages (day);

-- Hangouts ("catch-ups" in the contract): time you spent with people in person, on a day, for some hours.
CREATE TABLE catch_ups (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,                          -- YYYY-MM-DD, local
  time TEXT,                                  -- HH:MM, or NULL
  hours REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  others INTEGER NOT NULL DEFAULT 0           -- how many more were there, unnamed
);

CREATE TABLE catch_up_people (
  catch_up_id INTEGER NOT NULL REFERENCES catch_ups (id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people (id),
  PRIMARY KEY (catch_up_id, person_id)
);

-- Each chat's people, each once however many accounts they have there (you too).
CREATE VIEW chat_people AS
SELECT DISTINCT chat_members.chat_id, accounts.person_id
FROM chat_members JOIN accounts ON accounts.id = chat_members.account_id;

-- Each message with what most answers ask of it: its chat's type and platform, its month, who sent it and whether
-- that was you.
CREATE VIEW message_facts AS
SELECT messages.id, messages.chat_id, chats.type AS chat_type, chats.platform, messages.sent_at, messages.day,
       substr(messages.day, 1, 7) AS month, accounts.person_id AS sender_person_id, people.is_you AS from_you,
       messages.call_seconds
FROM messages
JOIN chats ON chats.id = messages.chat_id
JOIN accounts ON accounts.id = messages.sender_id
JOIN people ON people.id = accounts.person_id;

-- A one-to-one chat's other person: who you were talking with.
CREATE VIEW direct_with AS
SELECT chat_people.chat_id, chat_people.person_id
FROM chat_people
JOIN chats ON chats.id = chat_people.chat_id AND chats.type = 'direct'
JOIN people ON people.id = chat_people.person_id AND people.is_you = 0;
