import { withApi } from "@/lib/server/withApi";
import { serveDocumentFile } from "@/lib/server/serveDocumentFile";

export const dynamic = "force-dynamic";

/** Pretty URL: /api/documents/files/:id/:filename.pdf (filename is cosmetic; id is authoritative). */
export const GET = withApi(serveDocumentFile, {
  auth: true,
  rateLimits: [],
  sessionTouch: "read",
});
