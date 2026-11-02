import { channels, type Channel } from "@/lib/channels";
import { env } from "@/lib/env";
import { errorPage, escape, page, redirect } from "@/lib/html";
import { seal, unseal } from "@/lib/seal";
import { ownerOf } from "@/lib/session";
import { valuePage } from "@/lib/setup-page";

export const dynamic = "force-dynamic";

// The owner's setup page: the connector URL for Claude, the connected channels, add or remove one.
export function GET(req: Request) {
  const owner = ownerOf(req);
  if (!owner) return redirect(`/auth/google?mode=signin&next=${encodeURIComponent("/setup")}`);
  let list: Channel[] = [];
  let problem = "";
  try {
    list = channels();
  } catch (e) {
    problem = (e as Error).message;
  }
  const csrf = seal("setup", { owner }, 3600);
  const rows = list
    .map(
      (c) =>
        `<li><span>${escape(c.title)} <code>${escape(c.name)}</code></span><form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="remove" value="${escape(c.id)}"><button class="small">Remove</button></form></li>`,
    )
    .join("");
  return page(
    "Setup",
    `<h1>YouTube connector</h1><p>Signed in as ${escape(owner)}.</p>
<h2>Add to Claude</h2><p>Custom connector URL: <code>${escape(env.origin)}/mcp</code></p>
<h2>Channels</h2>${problem ? `<p class="bad">${escape(problem)}</p>` : ""}<ul>${rows || "<li>No channels yet.</li>"}</ul>
<a class="btn go" href="/auth/google?mode=channel">Add a channel</a>`,
  );
}

export async function POST(req: Request) {
  const owner = ownerOf(req);
  if (!owner) return redirect("/setup");
  const form = await req.formData();
  const csrf = unseal<{ owner: string }>("setup", String(form.get("csrf") ?? ""));
  if (!csrf || csrf.value.owner !== owner) return errorPage("This page expired. Open setup again.");
  const id = String(form.get("remove") ?? "");
  const list = channels().filter((c) => c.id !== id);
  return valuePage("Channel removed", list);
}
