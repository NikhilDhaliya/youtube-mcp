# YouTube MCP connector

Your own private, read-only YouTube connector for Claude and any other MCP client. Claude gets your channels' real
analytics (retention, traffic sources, search terms, audience) and all of public YouTube (search, any video or
channel, comments), so it can research the way you would with YouTube Studio open.

- **Yours only.** It runs on your Vercel account with your Google Cloud project. Only the Google accounts you list
  can connect it. Nothing sits in the middle.
- **Works everywhere Claude does.** It's a remote connector, so it works on claude.ai, the desktop and phone apps,
  and Claude Code, not only on one computer.
- **Free.** Vercel's free plan and YouTube's free API quota (10,000 units a day) are enough for one person.
- **No database.** Tokens and the channel list are encrypted with your key and carry their own expiry.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FNikhilDhaliya%2Fyoutube-mcp&env=CONNECTOR_KEY,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,YOUTUBE_API_KEY,OWNER_EMAILS&envDescription=See%20the%20setup%20steps%20in%20the%20README&envLink=https%3A%2F%2Fgithub.com%2FNikhilDhaliya%2Fyoutube-mcp%23setup&project-name=youtube-mcp&repository-name=youtube-mcp)

## What Claude can do with it

| Tool | What it does |
|---|---|
| `my_channels` | Your connected channels and their public totals |
| `youtube_analytics` | Any YouTube Analytics report for your channels: views, watch time, retention curves, traffic sources, search terms, audience, revenue |
| `youtube_data` | Any read call of the YouTube Data API: search, videos, channels, playlists, comments, trending charts |
| `find_breakouts` | Several searches at once, ranked by views per subscriber, to spot videos that broke out beyond their channel's size |

Ask things like:

- "How did my last three videos do in their first week, and where did the views come from?"
- "Find what broke out this week in budget AI hardware, and what the top comments ask for."
- "Compare my retention curve with the video that beat it."

## Setup

About 15 minutes. You need a Google account, a Vercel account, and Claude.

### 1. Google Cloud project

1. In [console.cloud.google.com](https://console.cloud.google.com), create a project.
2. **APIs & Services → Library**: enable **YouTube Data API v3** and **YouTube Analytics API**.
3. **APIs & Services → Credentials → Create credentials → API key**. Restrict it to the YouTube Data API v3. This is
   `YOUTUBE_API_KEY`.
4. **Google Auth Platform → Branding**: an app name, your email, a homepage URL and a privacy policy URL (Google
   asks for both before you can publish).
5. **Audience**: External, then **Publish app**. In "Testing", Google expires the channel logins after 7 days.
6. **Clients → Create client → Web application**. Add the redirect URI
   `https://<your-domain>/auth/google/callback` (you get the domain in step 2 below; you can edit this later), and
   `http://localhost:3000/auth/google/callback` if you'll run it locally. Copy the client ID and secret:
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 2. Deploy

Click **Deploy with Vercel** above and fill in:

| Variable | Value |
|---|---|
| `CONNECTOR_KEY` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 1.6 |
| `YOUTUBE_API_KEY` | From step 1.3 |
| `OWNER_EMAILS` | The Google account(s) allowed to use it, comma-separated |

Then put your Vercel domain into the Google client's redirect URI (step 1.6).

### 3. Add your channels

1. Open `https://<your-domain>/setup` and sign in with an owner account.
2. Click **Add a channel** and pick the Google account (or Brand Account) that owns the channel.
3. Copy the value it shows into a new Vercel environment variable `YOUTUBE_CHANNELS`, then redeploy.

Repeat for each channel. The value is encrypted with your `CONNECTOR_KEY`.

If Google shows **Error 400: invalid_request** for a channel's account, add that account to your Google Cloud
project (**IAM & Admin → Grant access**, role Editor) and try again.

### 4. Add it to Claude

**Settings → Connectors → Add custom connector**, URL `https://<your-domain>/mcp`. (On a Team or Enterprise plan,
an owner adds it under Organization settings → Connectors first.) Click **Connect**, sign in with your owner Google
account and click **Allow**.

## Security

- Read-only Google scopes: `youtube.readonly`, `yt-analytics.readonly`, `yt-analytics-monetary.readonly`.
- Only accounts in `OWNER_EMAILS` can sign in, add channels or allow a client.
- OAuth 2.1 with PKCE for clients. Access tokens last 1 hour, refresh tokens 90 days. Everything is sealed with
  AES-256-GCM using `CONNECTOR_KEY`.
- To sign every client out, change `CONNECTOR_KEY` and redeploy (then add your channels again). To cut off a
  channel, remove it in `/setup` and remove the app at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Limits

- Impressions and click-through rate aren't in YouTube's API (only in Studio).
- Other channels' transcripts aren't in the official API.
- 10,000 quota units a day per Google project: a search costs 100, most other reads cost 1.

## Run locally

```bash
cp .env.example .env.local   # fill it in
pnpm install
pnpm dev                     # http://localhost:3000
```

## Use it as a template

The OAuth server (`src/lib/oauth`, `src/app/oauth`, `src/app/api/oauth`, `src/app/.well-known`) and the MCP route
(`src/app/mcp`) don't depend on YouTube. Swap `src/lib/tools.ts` for your own tools to make any private connector.

## License

MIT
