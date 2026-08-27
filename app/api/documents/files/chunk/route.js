import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/server/whitelist";
import { withApi } from "@/lib/server/withApi";
import {
  MAX_FILE_BYTES,
  UPLOAD_CHUNK_BYTES,
  abortDocumentUpload,
  isUploadBlob,
  putDocumentUploadChunk,
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

  const uploads = form.getAll("chunk").filter(isUploadBlob);
  if (!uploads.length) {
    return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });
  }
  if (uploads.length > 1) {
    return NextResponse.json({ error: "Upload one chunk at a time" }, { status: 400 });
  }

  const chunk = uploads[0];
  if (chunk.size > UPLOAD_CHUNK_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Chunk too large" }, { status: 413 });
  }

  const sizeBytes = Number(form.get("size"));
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "This file must be 25 MB or smaller." },
      { status: 413 },
    );
  }

  try {
    const result = await putDocumentUploadChunk({
      uploadId: String(form.get("uploadId") || "") || null,
      chunkIndex: Number(form.get("chunkIndex")),
      chunkTotal: Number(form.get("chunkTotal")),
      filename: sanitizeFilename(String(form.get("filename") || chunk.name || "document")),
      mimeType: String(form.get("mimeType") || chunk.type || ""),
      sizeBytes,
      data: Buffer.from(await chunk.arrayBuffer()),
      authorEmail: session.email,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = Number(err?.status) || 500;
    return NextResponse.json(
      { error: err?.message || "Upload failed." },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}, { auth: true, rateLimits: ["ip", "user"] });

export const DELETE = withApi(async (request, _routeContext, { session }) => {
  if (!session?.email || !(await isEmailAllowed(session.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uploadId = request.nextUrl?.searchParams?.get("uploadId")
    || "";
  if (!uploadId) {
    return NextResponse.json({ error: "Missing upload id" }, { status: 400 });
  }

  try {
    const result = await abortDocumentUpload(uploadId, session);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.status === 403 ? "Forbidden" : "Not found" },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Could not cancel upload." },
      { status: 400 },
    );
  }
}, { auth: true, rateLimits: ["ip", "user"] });
