import { protectedResourceMetadata } from "@/lib/oauth/config";
import { metadata, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export function GET() {
  return metadata(protectedResourceMetadata());
}

export const OPTIONS = preflight;
