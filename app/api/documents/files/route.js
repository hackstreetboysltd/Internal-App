import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";
import {
  MAX_FILE_BYTES,
  insertDocumentFile,
  isUploadBlob,
  sanitizeFilename,
} from "@/lib/server/documentFiles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withApi(async (request, _routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const uploads = form.getAll("files").filter(isUploadBlob);
  if (!uploads.length) {
    return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });
  }
  if (uploads.length > 1) {
    return NextResponse.json({ error: "Upload one file at a time" }, { status: 400 });
  }

  const file = uploads[0];
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `This file must be 25 MB or smaller (${sanitizeFilename(file.name || "document")} is too large).` },
      { status: 413 },
    );
  }

  const named = sanitizeFilename(String(form.get("filename") || ""));
  const data = Buffer.from(await file.arrayBuffer());
  const row = await insertDocumentFile({
    filename: named || file.name || "document",
    mimeType: file.type || "",
    data,
    authorEmail: session.email,
  });

  return NextResponse.json({ files: [row] });
}, { auth: true, rateLimits: ["ip", "user", "write"] });
