// Entries ↔ markdown files.
//
// The backup repo is meant to be *readable*: open it on github.com years from
// now, or point Obsidian at a clone, and it should be plain notes — not a JSON
// blob. So each entry becomes one .md file with a small front-matter header.
//
// Front matter is deliberately a tiny fixed grammar (scalars plus one inline
// list), not real YAML — we write it and we parse it, and round-tripping has to
// be exact. Don't reach for a YAML library; keep the grammar boring instead.

const SECTIONS = [
  ['techniques', 'Techniques'],
  ['rolling', 'Rolling notes'],
  ['thoughts', 'Thoughts'],
];

const TYPE_HEADING = {
  class: 'Class', note: 'Note', question: 'Question',
  video: 'Video', principle: 'Coach principle',
};

// ---- tags <-> compact strings -------------------------------------------
// half-guard/pass/knee-slice   ·   half-guard/pass   ·   concept:Pressure

export function tagToString(tag) {
  if (tag.kind === 'concept') return `concept:${tag.concept}`;
  return [tag.position, tag.role ?? '-', tag.technique].filter(Boolean).join('/');
}

export function tagFromString(text) {
  if (text.startsWith('concept:')) return { kind: 'concept', concept: text.slice(8) };
  const [position, role, technique] = text.split('/');
  return {
    kind: 'pos',
    position,
    role: !role || role === '-' ? null : role,
    ...(technique ? { technique } : {}),
  };
}

// ---- front matter --------------------------------------------------------

const needsQuoting = v => /^[\s'"]|[:#]|\s$/.test(v);
const quote = v => (needsQuoting(v) ? `"${v.replace(/(["\\])/g, '\\$1')}"` : v);
const unquote = v => {
  const trimmed = v.trim();
  if (!/^".*"$/.test(trimmed)) return trimmed;
  return trimmed.slice(1, -1).replace(/\\(["\\])/g, '$1');
};

/** Path this entry occupies in the backup repo. Stable unless type or date change. */
export function pathFor(entry) {
  return `${entry.type}/${entry.date}-${entry.id.slice(0, 8)}.md`;
}

export function toMarkdown(entry) {
  const lines = ['---'];
  const field = (key, value) => { if (value) lines.push(`${key}: ${quote(String(value))}`); };

  field('id', entry.id);
  field('type', entry.type);
  field('date', entry.date);
  field('gi', entry.gi);
  if (entry.tags?.length) lines.push(`tags: [${entry.tags.map(tagToString).join(', ')}]`);
  if (entry.video?.url) {
    field('video_url', entry.video.url);
    field('video_id', entry.video.videoId);
  }
  field('created', entry.createdAt);
  field('updated', entry.updatedAt);
  lines.push('---', '');

  lines.push(`# ${entry.title || `${TYPE_HEADING[entry.type] ?? entry.type} — ${entry.date}`}`, '');

  if (entry.type === 'class') {
    for (const [key, heading] of SECTIONS) {
      const text = entry.sections?.[key]?.trim();
      if (text) lines.push(`## ${heading}`, '', text, '');
    }
  } else if (entry.body?.trim()) {
    lines.push(entry.body.trim(), '');
  }

  if (entry.video?.url) lines.push(`<${entry.video.url}>`, '');

  return lines.join('\n');
}

/**
 * Split a body into its `## Heading` blocks.
 *
 * Done by walking the headings rather than with a lookahead regex: JS has no
 * \Z, so "match until the next heading or the end" is fiddly to express and
 * quietly drops the final section when you get it wrong.
 */
function splitSections(text) {
  const headingRe = /^##[ \t]+(.+?)[ \t]*$/gm;
  const marks = [];
  let match;
  while ((match = headingRe.exec(text))) {
    marks.push({ name: match[1].toLowerCase(), from: match.index, body: match.index + match[0].length });
  }
  const blocks = {};
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].from : text.length;
    blocks[mark.name] = text.slice(mark.body, end).trim();
  });
  return blocks;
}

export function fromMarkdown(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!match) throw new Error('No front matter — not a JJ-app note');

  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }

  const tags = /^\[(.*)\]$/.exec(meta.tags ?? '')?.[1]
    ?.split(',').map(s => s.trim()).filter(Boolean).map(tagFromString) ?? [];

  const body = match[2];
  const titleMatch = /^#\s+(.+)$/m.exec(body);
  const afterTitle = titleMatch ? body.slice(body.indexOf(titleMatch[0]) + titleMatch[0].length) : body;

  const entry = {
    id: unquote(meta.id ?? ''),
    type: unquote(meta.type ?? 'note'),
    date: unquote(meta.date ?? ''),
    gi: meta.gi ? unquote(meta.gi) : null,
    title: titleMatch ? titleMatch[1].trim() : '',
    sections: { techniques: '', rolling: '', thoughts: '' },
    body: '',
    tags,
    video: meta.video_url
      ? {
          url: unquote(meta.video_url),
          videoId: unquote(meta.video_id ?? ''),
          title: titleMatch ? titleMatch[1].trim() : '',
          thumb: meta.video_id ? `https://i.ytimg.com/vi/${unquote(meta.video_id)}/mqdefault.jpg` : null,
        }
      : null,
    createdAt: unquote(meta.created ?? new Date().toISOString()),
    updatedAt: unquote(meta.updated ?? new Date().toISOString()),
  };

  // A title we generated ourselves is noise on the way back in. This has to
  // happen BEFORE the body is composed below: class entries written in the app
  // never have a title (the Log form has no such field), so every one of them
  // gets a generated `# Class — <date>` heading on the way out — and clearing
  // it afterwards left that heading baked into the body on every device that
  // pulled the note.
  if (entry.title === `${TYPE_HEADING[entry.type] ?? entry.type} — ${entry.date}`) entry.title = '';

  if (entry.type === 'class') {
    const blocks = splitSections(afterTitle);
    for (const [key, heading] of SECTIONS) {
      entry.sections[key] = blocks[heading.toLowerCase()] ?? '';
    }
    entry.body = [entry.title, entry.sections.techniques, entry.sections.rolling, entry.sections.thoughts]
      .filter(Boolean).join('\n');
  } else {
    entry.body = afterTitle.replace(/^<https?:\/\/[^>]+>$/m, '').trim();
  }

  return entry;
}

// ---- ontology corrections ------------------------------------------------
// Kept in the backup repo too, so the user's fixes to the technique list
// survive a lost phone and reach their other devices.

export function overridesToMarkdown(corrections) {
  const lines = [
    '---',
    `updated: ${corrections.updatedAt || new Date().toISOString()}`,
    '---',
    '',
    '# Ontology corrections',
    '',
    'Your fixes to the shipped technique list. Written by JJ-app —',
    'edit these in the app, not here.',
    '',
    '## Taught words',
    '',
  ];

  if (corrections.aliases?.length) {
    for (const alias of corrections.aliases) lines.push(`- ${alias.term} -> ${tagToString(alias.tag)}`);
  } else {
    lines.push('_none_');
  }

  lines.push('', '## Muted words', '');
  if (corrections.muted?.length) {
    for (const m of corrections.muted) lines.push(`- ${m.term}`);
  } else {
    lines.push('_none_');
  }
  lines.push('');

  return lines.join('\n');
}

export function overridesFromMarkdown(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!match) throw new Error('Not an overrides file');

  const updatedAt = /^updated:\s*(.+)$/m.exec(match[1])?.[1]?.trim() ?? '';
  const blocks = splitSections(match[2]);

  const items = name => (blocks[name] ?? '')
    .split('\n')
    .map(line => /^-\s+(.*)$/.exec(line.trim())?.[1]?.trim())
    .filter(Boolean);

  const aliases = [];
  for (const line of items('taught words')) {
    const [term, target] = line.split('->').map(s => s.trim());
    if (term && target) aliases.push({ term, tag: tagFromString(target) });
  }

  return { aliases, muted: items('muted words').map(term => ({ term })), updatedAt };
}

/** A browsable index for the backup repo's front page. */
export function buildIndex(entries) {
  const lines = [
    '# Training notes',
    '',
    'Backup of [JJ-app](https://github.com/kezbolino/JJ-app). Written by the app —',
    'edit in the app, not here, or your next sync will overwrite it.',
    '',
    `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · updated ${new Date().toISOString().slice(0, 10)}`,
    '',
  ];

  const classes = entries.filter(e => e.type === 'class');
  const rest = entries.filter(e => e.type !== 'class');

  if (classes.length) {
    lines.push('## Classes', '');
    for (const e of classes) {
      const tags = (e.tags ?? []).slice(0, 4).map(tagToString).join(', ');
      lines.push(`- [${e.date}](${pathFor(e)})${tags ? ` · ${tags}` : ''}`);
    }
    lines.push('');
  }

  if (rest.length) {
    lines.push('## Notes, questions, videos, principles', '');
    for (const e of rest) {
      const label = e.title || (e.body ?? '').split('\n')[0].slice(0, 60) || e.type;
      lines.push(`- [${label}](${pathFor(e)}) · ${e.type} · ${e.date}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
