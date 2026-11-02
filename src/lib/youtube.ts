import "server-only";
import { channels, findChannel } from "./channels";
import { env } from "./env";
import { refreshAccess } from "./google";

// YouTube's official APIs, read-only. The Data API with the project's key (public data: search, any video or
// channel, comments), or with a channel's own login when as_channel is given; the Analytics API with each connected
// channel's refresh token. Default quota: 10,000 units a day per Google project; a search costs 100, most reads 1.

const DATA = "https://www.googleapis.com/youtube/v3/";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const TIMEOUT_MS = 25_000;

export const DATA_RESOURCES = [
  "search",
  "videos",
  "channels",
  "playlistItems",
  "playlists",
  "commentThreads",
  "comments",
  "activities",
  "channelSections",
  "videoCategories",
  "i18nRegions",
  "i18nLanguages",
] as const;
export type DataResource = (typeof DATA_RESOURCES)[number];
type Params = Record<string, string | number | boolean>;

const tokenCache = new Map<string, { token: string; until: number }>();

async function accessToken(channel: string): Promise<string> {
  const c = findChannel(channel);
  const cached = tokenCache.get(c.id);
  if (cached && cached.until > Date.now()) return cached.token;
  let result;
  try {
    result = await refreshAccess(c.refreshToken);
  } catch {
    throw new Error(`The login for ${c.title} stopped working (revoked or expired). The owner adds the channel again at /setup.`);
  }
  tokenCache.set(c.id, { token: result.access_token, until: Date.now() + (result.expires_in - 120) * 1000 });
  return result.access_token;
}

// The channel behind a fresh login, when /setup adds one.
export async function channelInfo(accessTokenValue: string) {
  const r = (await get(DATA + "channels", { part: "snippet", mine: true }, accessTokenValue)) as {
    items?: { id: string; snippet: { title: string; customUrl?: string } }[];
  };
  const c = r.items?.[0];
  return c ? { id: c.id, title: c.snippet.title, handle: c.snippet.customUrl } : null;
}

async function get(url: string, params: Params, token?: string) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${url}?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 500);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {}
    throw new Error(`YouTube ${res.status}: ${message}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export async function dataApi(resource: DataResource, params: Params, asChannel?: string) {
  const clean = Object.fromEntries(Object.entries(params).filter(([k]) => !["key", "access_token", "oauth_token"].includes(k)));
  if (asChannel) return get(DATA + resource, clean, await accessToken(asChannel));
  return get(DATA + resource, { ...clean, key: env.youtubeApiKey });
}

export async function analytics(channel: string, params: Params) {
  const report = (await get(ANALYTICS, { ids: "channel==MINE", ...params }, await accessToken(channel))) as {
    columnHeaders?: { name: string }[];
    rows?: (string | number)[][];
  };
  const cols = (report.columnHeaders ?? []).map((h) => h.name);
  return { columns: cols, rows: (report.rows ?? []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))) };
}

export async function myChannels() {
  const list = channels();
  if (!list.length) return { channels: [], note: "No channels are connected yet. The owner adds them at /setup." };
  const r = (await dataApi("channels", { part: "snippet,statistics", id: list.map((c) => c.id).join(",") })) as {
    items?: { id: string; snippet: { customUrl?: string }; statistics: Record<string, string> }[];
  };
  const stats = new Map((r.items ?? []).map((i) => [i.id, i]));
  return {
    channels: list.map((c) => ({ channel: c.name, id: c.id, title: c.title, handle: stats.get(c.id)?.snippet.customUrl, ...stats.get(c.id)?.statistics })),
  };
}

function seconds(iso: string) {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [d, h, min, s] = m.slice(1).map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

type Video = {
  id: string;
  snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails: { duration: string };
};

// Several searches at once, then each video's stats and its channel's size: views per subscriber shows what broke
// out beyond its own audience.
export async function findBreakouts(queries: string[], days: number, minMinutes: number, language?: string, region?: string) {
  const after = new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");
  const found = new Map<string, string>();
  const errors: string[] = [];
  await Promise.all(
    queries.map(async (q) => {
      try {
        const r = (await dataApi("search", {
          part: "id",
          q,
          type: "video",
          order: "viewCount",
          publishedAfter: after,
          maxResults: 25,
          ...(language ? { relevanceLanguage: language } : {}),
          ...(region ? { regionCode: region } : {}),
        })) as { items: { id: { videoId: string } }[] };
        for (const item of r.items) if (!found.has(item.id.videoId)) found.set(item.id.videoId, q);
      } catch (e) {
        errors.push(`${q}: ${(e as Error).message}`);
      }
    }),
  );
  const ids = [...found.keys()];
  const info = new Map<string, Video>();
  for (let i = 0; i < ids.length; i += 50) {
    const r = (await dataApi("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") })) as { items: Video[] };
    for (const v of r.items) info.set(v.id, v);
  }
  const channelIds = [...new Set([...info.values()].map((v) => v.snippet.channelId))];
  const subs = new Map<string, number>();
  for (let i = 0; i < channelIds.length; i += 50) {
    const r = (await dataApi("channels", { part: "statistics", id: channelIds.slice(i, i + 50).join(",") })) as {
      items: { id: string; statistics: { subscriberCount?: string } }[];
    };
    for (const c of r.items) subs.set(c.id, Number(c.statistics.subscriberCount ?? 0));
  }
  const videos = [...info.values()]
    .filter((v) => seconds(v.contentDetails.duration) >= minMinutes * 60)
    .map((v) => {
      const views = Number(v.statistics.viewCount ?? 0);
      const s = subs.get(v.snippet.channelId) ?? 0;
      return {
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        channel_id: v.snippet.channelId,
        subscribers: s,
        views,
        likes: Number(v.statistics.likeCount ?? 0),
        comments: Number(v.statistics.commentCount ?? 0),
        views_per_subscriber: Math.round((views / Math.max(s, 100)) * 10) / 10,
        minutes: Math.round(seconds(v.contentDetails.duration) / 6) / 10,
        published: v.snippet.publishedAt.slice(0, 10),
        found_by: found.get(v.id),
        url: `https://youtu.be/${v.id}`,
      };
    })
    .sort((a, b) => b.views_per_subscriber - a.views_per_subscriber || b.views - a.views)
    .slice(0, 30);
  return { days, searched: queries, quota_used: queries.length * 100 + Math.ceil(ids.length / 50) + Math.ceil(channelIds.length / 50), videos, ...(errors.length ? { errors } : {}) };
}
