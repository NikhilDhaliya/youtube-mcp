import "server-only";
import { env } from "./env";
import { seal, unseal } from "./seal";

// The channels the connector can read privately, kept in the YOUTUBE_CHANNELS env as one sealed value (made by
// /setup), so there's no database. Each holds the channel's own read-only refresh token.

export type Channel = { id: string; name: string; title: string; refreshToken: string };

const TTL_S = 50 * 365 * 24 * 3600;

export function channels(): Channel[] {
  const raw = env.youtubeChannels;
  if (!raw) return [];
  const opened = unseal<Channel[]>("channels", raw);
  if (!opened) throw new Error("YOUTUBE_CHANNELS can't be opened (it was made with another CONNECTOR_KEY). Add your channels again at /setup.");
  return opened.value;
}

export function sealChannels(list: Channel[]) {
  return seal("channels", list, TTL_S);
}

export function findChannel(nameOrId: string): Channel {
  const key = nameOrId.trim().replace(/^@/, "").toLowerCase();
  const all = channels();
  const found = all.find((c) => c.name === key || c.id.toLowerCase() === key);
  if (!found) {
    throw new Error(
      all.length
        ? `No channel "${nameOrId}". Connected: ${all.map((c) => c.name).join(", ")}.`
        : "No channels are connected yet. The owner adds them at /setup.",
    );
  }
  return found;
}

// A short, stable name for tools: the handle without "@", else the channel id.
export function channelName(handle: string | undefined, id: string) {
  return (handle ?? id).replace(/^@/, "").toLowerCase();
}
