import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";
import {
  deleteDocumentFile,
  getDocumentFile,
  renameDocumentFile,
  sanitizeFilename,
} from "@/lib/server/documentFiles";

export const dynamic = "force-dynamic";

function contentDisposition(filename) {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\w.\-() ]+/g, "_") || "document";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export const GET = withApi(async (_request, routeContext, { session }) => {
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
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": contentDisposition(row.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, { auth: true, rateLimits: ["ip", "user"] });

export const DELETE = withApi(async (_request, routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await routeContext.params;
  const result = await deleteDocumentFile(id, session);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 403 ? "Forbidden" : "Not found" },
      { status: result.status },
    );
  }
  return NextResponse.json({ success: true });
}, { auth: true, rateLimits: ["ip", "user", "write"] });

export const PATCH = withApi(async (request, routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await routeContext.params;
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await renameDocumentFile(id, body?.filename, session);
  if (!result.ok) {
    const message = result.status === 403
      ? "Forbidden"
      : result.status === 400
        ? "Enter a file name"
        : "Not found";
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json({ success: true, filename: result.filename });
}, { auth: true, rateLimits: ["ip", "user", "write"] });
