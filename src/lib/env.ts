import "server-only";

// Server env, read lazily so a missing value fails the request that needs it, not the build. See .env.example.
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const env = {
  // The public origin: APP_URL, else Vercel's production domain.
  get origin() {
    const url =
      process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
    return new URL(url).origin;
  },
  // 32 random bytes, base64 (openssl rand -base64 32). Seals tokens, sessions and the channel list.
  get connectorKey() {
    return required("CONNECTOR_KEY");
  },
  // A Google OAuth client of type "Web application" in the same Google Cloud project.
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get youtubeApiKey() {
    return required("YOUTUBE_API_KEY");
  },
  // Google accounts allowed to sign in, connect Claude and manage channels. Comma-separated.
  get ownerEmails(): string[] {
    return required("OWNER_EMAILS")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  // The sealed channel list that /setup gives you. Empty until you add a channel.
  get youtubeChannels() {
    return process.env.YOUTUBE_CHANNELS?.trim() ?? "";
  },
};
