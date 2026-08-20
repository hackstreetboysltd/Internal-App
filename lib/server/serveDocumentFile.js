import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/server/whitelist";
import {
  documentContentDisposition,
  getDocumentFile,
} from "@/lib/server/documentFiles";

/** Browsers can preview these inline; Office/other types download instead of hanging on a blank tab. */
const INLINE_MIME_RE = /^(image\/|text\/|application\/pdf\b|application\/json\b)/i;

function prefersInline(mimeType, filename) {
  const mime = String(mimeType || "");
  if (INLINE_MIME_RE.test(mime)) return true;
  const name = String(filename || "").toLowerCase();
  return /\.(pdf|png|jpe?g|gif|webp|svg|txt|md|csv|json)$/i.test(name);
}

/**
 * Serve a stored document for authenticated viewers (browser PDF/image viewer).
 * Optional `?download=1` forces a save dialog instead of inline display.
 * Uses local disk cache when available so opens stay fast on remote Postgres.
 * @type {(request: import('next/server').NextRequest, routeContext: { params: Promise<{ id: string }> }, api: { session: Record<string, unknown> | null }) => Promise<Response>}
 */
export async function serveDocumentFile(request, routeContext, { session }) {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await routeContext.params;
  const row = await getDocumentFile(id);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const raw = row.data;
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (!bytes.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const forceDownload = request.nextUrl?.searchParams?.get("download") === "1";
  const disposition = forceDownload || !prefersInline(row.mime_type, row.filename)
    ? "attachment"
    : "inline";
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": documentContentDisposition(row.filename, disposition),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
