import { authorizationServerMetadata } from "@/lib/oauth/config";
import { metadata, preflight } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export function GET() {
  return metadata(authorizationServerMetadata());
}

export const OPTIONS = preflight;
