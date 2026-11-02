import "server-only";
import type { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { analytics, DATA_RESOURCES, dataApi, findBreakouts, myChannels } from "./youtube";

type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

export const INSTRUCTIONS =
  "Read-only YouTube for the owner of this connector. Research like a person with YouTube Studio and search open: " +
  "the owner's channels' private analytics (youtube_analytics; call my_channels first for their names), anything " +
  "public on YouTube (youtube_data), and what's breaking out in a niche (find_breakouts). Quota is the owner's own " +
  "Google project, 10,000 units a day by default: a search costs 100 units, nearly every other read costs 1, so " +
  "prefer videos/channels/playlistItems lookups and search deliberately. Analytics data lags about 2 days.";

const MAX_CHARS = 120_000;
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;
const param = z.union([z.string(), z.number(), z.boolean()]);

async function run(fn: () => Promise<unknown>) {
  try {
    let text = JSON.stringify(await fn());
    if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS)}… [cut at ${MAX_CHARS} characters: ask for fewer results or parts]`;
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return { content: [{ type: "text" as const, text: (error as Error).message || "YouTube request failed." }], isError: true };
  }
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "my_channels",
    {
      title: "My YouTube channels",
      description: "The owner's connected channels: their names for the other tools, ids, titles and public totals.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    () => run(() => myChannels()),
  );

  server.registerTool(
    "youtube_analytics",
    {
      title: "YouTube Analytics report",
      description:
        "Any YouTube Analytics API v2 report (reports.query) for one of the owner's channels; ids is set for you. " +
        "Examples: metrics 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained," +
        "subscribersLost' with dimensions 'day' or 'video' (sort '-views', maxResults); traffic with dimensions " +
        "'insightTrafficSourceType'; search terms with dimensions 'insightTrafficSourceDetail' and filters " +
        "'insightTrafficSourceType==YT_SEARCH'; retention with dimensions 'elapsedVideoTimeRatio' and filters " +
        "'video==<id>' (metrics audienceWatchRatio,relativeRetentionPerformance); audience with 'ageGroup,gender' or " +
        "'country'. Impressions and click-through rate are not in this API. Rows come back as objects.",
      inputSchema: z.object({
        channel: z.string().describe("A channel name (or id) from my_channels."),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
        metrics: z.string().min(1),
        dimensions: z.string().optional(),
        filters: z.string().optional(),
        sort: z.string().optional(),
        maxResults: z.number().int().min(1).max(200).optional(),
        currency: z.string().optional(),
      }),
      annotations: READ,
    },
    ({ channel, ...params }) =>
      run(() => analytics(channel, Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number>)),
  );

  server.registerTool(
    "youtube_data",
    {
      title: "YouTube Data API",
      description:
        "Any read (list) call of the YouTube Data API v3, with its usual parameters. Examples: resource 'videos' " +
        "{part:'snippet,statistics,contentDetails', id:'<id1>,<id2>'} (up to 50 ids, 1 unit); 'videos' " +
        "{part:'snippet,statistics', chart:'mostPopular', regionCode:'US', videoCategoryId:'28'} (trending); " +
        "'channels' {part:'snippet,statistics,contentDetails', forHandle:'@name'}; 'playlistItems' " +
        "{part:'snippet', playlistId:'UU<channel id without UC>', maxResults:50} (a channel's uploads, 1 unit); " +
        "'commentThreads' {part:'snippet', videoId:'<id>', order:'relevance', maxResults:50} (what viewers say); " +
        "'search' {part:'snippet', q:'...', type:'video', order:'viewCount', publishedAfter:'<RFC3339>'} (100 units). " +
        "Set as_channel to call as one of the owner's channels (e.g. channels {mine:true}, or private fields).",
      inputSchema: z.object({
        resource: z.enum(DATA_RESOURCES),
        params: z.record(z.string(), param).describe("Query parameters for the list call; part is required by YouTube."),
        as_channel: z.string().optional().describe("Call with this channel's own login instead of the public key."),
      }),
      annotations: READ,
    },
    ({ resource, params, as_channel }) => run(() => dataApi(resource, params, as_channel)),
  );

  server.registerTool(
    "find_breakouts",
    {
      title: "Find breakout videos",
      description:
        "Searches several phrasings at once for videos from the last N days, then returns them with each channel's " +
        "size and views per subscriber, highest first (high = it broke out beyond its own audience). Long-form only " +
        "by default. Costs 100 units per query, so 3-6 focused queries is plenty.",
      inputSchema: z.object({
        queries: z.array(z.string().min(2).max(100)).min(1).max(8),
        days: z.number().int().min(1).max(60).optional().describe("How far back; default 7."),
        min_minutes: z.number().min(0).max(120).optional().describe("Shortest length to keep; default 1.5 (drops Shorts)."),
        language: z.string().optional().describe("relevanceLanguage, e.g. 'en' or 'hi'. Default: any."),
        region: z.string().length(2).optional().describe("regionCode, e.g. 'US' or 'IN'."),
      }),
      annotations: READ,
    },
    ({ queries, days, min_minutes, language, region }) =>
      run(() => findBreakouts(queries, days ?? 7, min_minutes ?? 1.5, language, region)),
  );
}
