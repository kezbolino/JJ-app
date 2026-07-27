// YouTube link handling.
//
// The video id and thumbnail come from the URL itself, so saving a link works
// offline — which matters, because this is an offline-first app and the gym
// wifi is not a given. The title needs a network call; if it fails, the user
// types one.

const PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/(?:embed|shorts|live)\/)([\w-]{11})/,
];

export function parseVideoId(url) {
  for (const re of PATTERNS) {
    const match = re.exec(url);
    if (match) return match[1];
  }
  return null;
}

export function thumbFor(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Best-effort title lookup. Returns null offline or if the call is blocked. */
export async function fetchTitle(url) {
  try {
    const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title ?? null, channel: data.author_name ?? null };
  } catch {
    return null;
  }
}
