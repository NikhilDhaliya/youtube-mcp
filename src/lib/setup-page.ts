import "server-only";
import { type Channel, sealChannels } from "./channels";
import { escape, page } from "./html";

// Shows the new YOUTUBE_CHANNELS value after adding or removing a channel.
export function valuePage(heading: string, list: Channel[]) {
  const names = list.map((c) => `<li><span>${escape(c.title)}</span><code>${escape(c.name)}</code></li>`).join("");
  return page(
    heading,
    `<h1>${escape(heading)}</h1><p>Set <code>YOUTUBE_CHANNELS</code> to the value below in your host's environment variables (Vercel: Settings → Environment Variables), then redeploy. It's encrypted with your CONNECTOR_KEY.</p>
<textarea readonly>${escape(list.length ? sealChannels(list) : "")}</textarea>
<h2>Channels in this value</h2><ul>${names || "<li>None</li>"}</ul><a class="btn" href="/setup">Back to setup</a>`,
  );
}
