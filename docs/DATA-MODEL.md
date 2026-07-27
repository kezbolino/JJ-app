# Data model

The part that is expensive to change later. Everything else in the app is a
view over this.

## One entry type for everything

A class journal, a stray note, a question, a saved video and a coach principle
are all the same record, distinguished by `type`. One store, one search, one
tagging path.

```js
{
  id:        crypto.randomUUID(),
  type:      'class' | 'note' | 'question' | 'video' | 'principle',
  date:      '2026-07-27',
  coach:     'John',
  gi:        'gi' | 'nogi' | null,
  title:     '',
  sections:  { techniques: '', rolling: '', thoughts: '' },  // class entries
  body:      '',      // free text; for classes, the joined sections
  tags:      [ /* see below */ ],
  video:     { videoId, url, title, thumb } | null,
  createdAt: ISO,
  updatedAt: ISO,      // import/merge resolves conflicts on this
}
```

`gi` is nullable on purpose — a note scribbled on the train belongs to neither.

## Tags are pairs, never words

This is the load-bearing decision.

```js
{ kind: 'pos', position: 'half-guard', role: 'pass', technique: 'knee-slice' }
{ kind: 'concept', concept: 'Pressure' }
```

`role` and `technique` are both optional: you can tag a whole position when an
entry is vague. But because the *shape* is a pair, the app can ask "how much
have you written about half guard **passing**, versus half guard **sweeps**?"

A flat tag list cannot answer that, and retrofitting the pair means re-tagging
every entry ever written. Hence: from the first schema.

## Coverage is derived, never stored

`store.coverage()` folds entries into `position → role → count` on read. No
denormalised counters to drift out of sync, and re-tagging an old entry
immediately corrects every number that depends on it.

Counting rule: **one entry counts once per cell.** A detailed entry naming four
half-guard passes counts the same as a terse one naming a single pass —
otherwise verbosity would masquerade as volume.

## What coverage does and does not claim

It reports what you have **written about**. It never claims what you are good
at. "You've written about half guard pass 4 times and nothing on retain" is a
fact about your notes; "your half guard retention is weak" would be a guess.

The app only ever says the first kind of thing. If a competence signal is
wanted later, it needs real input — rolling outcomes, self-ratings, competition
results — not more inference over the same notes.

## Storage

IndexedDB, database `jj-app`, stores `entries` and `settings`.

Migrations live in `js/db.js` — bump `DB_VERSION` and add a new `if (oldVersion
< n)` block. Never edit an existing block; users' databases have already run it.

⚠️ **This is one device's browser storage.** Sync and backup to a private
GitHub data repo is agreed but unbuilt — see `OPEN-QUESTIONS.md` §13. Until it
exists, `js/backup.js` (Library → Export) is the only thing preventing total
loss.
