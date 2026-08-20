'use client';

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SessionProvider } from "@/lib/session";
import {
    detectDocumentKind,
    loadDocumentBlob,
    triggerBlobDownload,
} from "../../documentsHelpers";
import "./documentViewer.css";

async function renderPdfPages(buffer, host) {
    const pdfjs = await import("pdfjs-dist");
    // Worker must match pdfjs-dist version; CDN avoids Turbopack worker URL issues.
    pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    host.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "doc-viewer-pdf-pages";
    host.appendChild(wrap);

    const maxWidth = Math.min(host.clientWidth || window.innerWidth, 960);
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.max(0.75, (maxWidth - 32) / unscaled.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.className = "doc-viewer-pdf-page";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute("aria-label", `Page ${pageNum} of ${pdf.numPages}`);
        wrap.appendChild(canvas);
        await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
        }).promise;
    }
}

function ViewerBody() {
    const params = useParams();
    const searchParams = useSearchParams();
    const id = String(params?.id || "");
    const hintName = searchParams.get("name") || "document";

    const hostRef = useRef(null);
    const blobUrlRef = useRef(null);

    const [status, setStatus] = useState("loading");
    const [error, setError] = useState("");
    const [title, setTitle] = useState(hintName);
    const [kind, setKind] = useState("unknown");
    const [blob, setBlob] = useState(null);
    const [objectUrl, setObjectUrl] = useState("");
    const [textContent, setTextContent] = useState("");
    const [renderBuffer, setRenderBuffer] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!id) {
                setStatus("error");
                setError("Missing document id.");
                return;
            }
            setStatus("loading");
            setError("");
            setRenderBuffer(null);
            setObjectUrl("");
            setTextContent("");
            try {
                const loaded = await loadDocumentBlob({ id, name: hintName });
                if (cancelled) return;
                const nextKind = detectDocumentKind(loaded.name, loaded.mimeType);
                const displayName = loaded.name || hintName;
                setTitle(displayName);
                setKind(nextKind);
                setBlob(loaded.blob);
                document.title = displayName;

                if (nextKind === "pdf" || nextKind === "docx" || nextKind === "pptx") {
                    setRenderBuffer(await loaded.blob.arrayBuffer());
                    setStatus("ready");
                    return;
                }

                if (nextKind === "image") {
                    const typed = loaded.blob.type?.startsWith("image/")
                        ? loaded.blob
                        : new Blob([loaded.blob], { type: loaded.mimeType || "image/png" });
                    const url = URL.createObjectURL(typed);
                    blobUrlRef.current = url;
                    setObjectUrl(url);
                    setStatus("ready");
                    return;
                }

                if (nextKind === "text") {
                    setTextContent(await loaded.blob.text());
                    setStatus("ready");
                    return;
                }

                setStatus("unsupported");
            } catch (e) {
                if (cancelled) return;
                console.error(e);
                setStatus("error");
                setError(e?.message || "Could not open this document.");
            }
        }

        run();
        return () => {
            cancelled = true;
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [id, hintName]);

    useEffect(() => {
        if (status !== "ready" || !renderBuffer || !hostRef.current) return;
        if (kind !== "pdf" && kind !== "docx" && kind !== "pptx") return;

        let cancelled = false;
        const host = hostRef.current;
        host.innerHTML = "";

        (async () => {
            try {
                if (kind === "pdf") {
                    await renderPdfPages(renderBuffer, host);
                    return;
                }
                if (kind === "docx") {
                    const { renderAsync } = await import("docx-preview");
                    if (cancelled) return;
                    await renderAsync(renderBuffer, host, undefined, {
                        className: "docx-preview-body",
                        inWrapper: true,
                        breakPages: true,
                    });
                    return;
                }
                if (kind === "pptx") {
                    const { init } = await import("pptx-preview");
                    if (cancelled) return;
                    const width = Math.max(320, host.clientWidth || window.innerWidth);
                    const height = Math.max(240, host.clientHeight || window.innerHeight - 52);
                    const viewer = init(host, { width, height, mode: "slide" });
                    await viewer.preview(renderBuffer);
                }
            } catch (e) {
                if (cancelled) return;
                console.error(e);
                setStatus("error");
                setError(e?.message || "Could not render this document.");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [status, kind, renderBuffer]);

    const onDownload = () => {
        if (blob) triggerBlobDownload(blob, title);
    };

    const fillStage = kind === "pptx";

    return (
        <div className="doc-viewer">
            <header className="doc-viewer-bar">
                <div className="doc-viewer-title" title={title}>{title}</div>
                <div className="doc-viewer-actions">
                    {blob ? (
                        <button type="button" className="doc-viewer-btn" onClick={onDownload}>
                            <i className="fa-solid fa-download" aria-hidden="true"></i>
                            Download
                        </button>
                    ) : null}
                    <button type="button" className="doc-viewer-btn" onClick={() => window.close()}>
                        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                        Close
                    </button>
                </div>
            </header>

            <div className={`doc-viewer-stage${fillStage ? " is-fill" : ""}`}>
                {status === "loading" ? (
                    <div className="doc-viewer-msg" aria-busy="true">
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                        Opening document…
                    </div>
                ) : null}

                {status === "error" ? (
                    <div className="doc-viewer-msg is-error">{error}</div>
                ) : null}

                {status === "unsupported" ? (
                    <div className="doc-viewer-msg">
                        <p>This file type can’t be previewed in the browser.</p>
                        <button type="button" className="doc-viewer-btn primary" onClick={onDownload}>
                            Download file
                        </button>
                    </div>
                ) : null}

                {status === "ready" && kind === "image" && objectUrl ? (
                    <div className="doc-viewer-image-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="doc-viewer-image" src={objectUrl} alt={title} />
                    </div>
                ) : null}

                {status === "ready" && kind === "text" ? (
                    <pre className="doc-viewer-text">{textContent}</pre>
                ) : null}

                {status === "ready" && (kind === "pdf" || kind === "docx" || kind === "pptx") ? (
                    <div
                        ref={hostRef}
                        className={
                            kind === "pdf"
                                ? "doc-viewer-pdf"
                                : kind === "docx"
                                    ? "doc-viewer-docx"
                                    : "doc-viewer-pptx"
                        }
                    />
                ) : null}
            </div>
        </div>
    );
}

export default function DocumentViewerClient() {
    return (
        <SessionProvider requireAuth>
            <ViewerBody />
        </SessionProvider>
    );
}
