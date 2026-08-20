'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { SessionProvider } from "@/lib/session";
import {
    detectDocumentKind,
    loadDocumentBlob,
    triggerBlobDownload,
} from "../../documentsHelpers";
import "./documentViewer.css";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const STAGE_PAD = 24;

function clampZoom(value) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

async function renderPdfPages(buffer, host, cssWidth, userZoom) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    host.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "doc-viewer-pdf-pages";
    host.appendChild(wrap);

    const targetWidth = Math.max(200, (cssWidth || 640) - STAGE_PAD);
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const unscaled = page.getViewport({ scale: 1 });
        const fit = targetWidth / unscaled.width;
        const viewport = page.getViewport({ scale: Math.max(0.25, fit * userZoom) });
        const canvas = document.createElement("canvas");
        canvas.className = "doc-viewer-pdf-page";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.maxWidth = `${viewport.width}px`;
        canvas.style.height = "auto";
        canvas.setAttribute("aria-label", `Page ${pageNum} of ${pdf.numPages}`);
        wrap.appendChild(canvas);
        await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
        }).promise;
    }
}

function ZoomControls({ zoom, onZoomOut, onZoomIn, onReset }) {
    return (
        <div className="doc-viewer-zoom" role="group" aria-label="Zoom">
            <button type="button" className="doc-viewer-btn icon" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
                <i className="fa-solid fa-minus" aria-hidden="true"></i>
            </button>
            <button type="button" className="doc-viewer-zoom-label" onClick={onReset} title="Reset to fit width">
                {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="doc-viewer-btn icon" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
                <i className="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
        </div>
    );
}

/** Measure natural page size with transform cleared. */
function measureNatural(host) {
    const img = host.querySelector("img");
    if (img?.naturalWidth) {
        return {
            width: img.naturalWidth,
            height: img.naturalHeight || img.offsetHeight || 0,
        };
    }

    const pages = host.querySelectorAll(
        "section.docx, section.docx-preview-body, .docx-wrapper > section",
    );
    let width = 0;
    if (pages.length) {
        pages.forEach((page) => {
            width = Math.max(width, page.scrollWidth || 0, page.offsetWidth || 0);
        });
    } else {
        width = Math.max(host.scrollWidth || 0, host.offsetWidth || 0);
    }
    const height = Math.max(host.scrollHeight || 0, host.offsetHeight || 0);
    return { width, height };
}

/**
 * Scale fixed-layout content to fit stage width via transform:scale.
 * Shell gets the post-scale box so the scrollport does not overflow horizontally.
 */
function applyFitScale({ stage, host, shell, userZoom }) {
    if (!stage || !host || !shell) return 1;

    const available = Math.max(120, stage.clientWidth - STAGE_PAD);

    host.style.transform = "none";
    host.style.width = "";
    shell.style.width = "auto";
    shell.style.height = "auto";

    const natural = measureNatural(host);
    if (natural.width <= 0) return 1;

    const fit = Math.min(1, available / natural.width);
    const scale = Math.max(0.05, fit * userZoom);

    host.style.width = `${natural.width}px`;
    host.style.transform = `scale(${scale})`;
    host.style.transformOrigin = "top left";
    shell.style.width = `${Math.ceil(natural.width * scale)}px`;
    shell.style.height = `${Math.ceil(natural.height * scale)}px`;

    return fit;
}

function ViewerBody() {
    const params = useParams();
    const searchParams = useSearchParams();
    const id = String(params?.id || "");
    const hintName = searchParams.get("name") || "document";

    const stageRef = useRef(null);
    const hostRef = useRef(null);
    const shellRef = useRef(null);
    const blobUrlRef = useRef(null);

    const [status, setStatus] = useState("loading");
    const [error, setError] = useState("");
    const [title, setTitle] = useState(hintName);
    const [kind, setKind] = useState("unknown");
    const [blob, setBlob] = useState(null);
    const [objectUrl, setObjectUrl] = useState("");
    const [textContent, setTextContent] = useState("");
    const [renderBuffer, setRenderBuffer] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [fitScale, setFitScale] = useState(1);
    const [stageWidth, setStageWidth] = useState(0);

    const usesFitScale = kind === "docx" || kind === "image" || kind === "text";

    const updateFitScale = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;

        setStageWidth(Math.max(120, stage.clientWidth - STAGE_PAD));

        if (!usesFitScale) {
            setFitScale(1);
            return;
        }

        const fit = applyFitScale({
            stage,
            host: hostRef.current,
            shell: shellRef.current,
            userZoom: zoom,
        });
        setFitScale(fit);
    }, [usesFitScale, zoom]);

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
            setZoom(1);
            setFitScale(1);
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
        const stage = stageRef.current;
        if (!stage || typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(() => {
            requestAnimationFrame(() => updateFitScale());
        });
        ro.observe(stage);
        requestAnimationFrame(() => updateFitScale());
        return () => ro.disconnect();
    }, [status, kind, updateFitScale]);

    useEffect(() => {
        if (status !== "ready" || !renderBuffer || !hostRef.current) return;
        if (kind !== "pdf" && kind !== "docx" && kind !== "pptx") return;

        let cancelled = false;
        const host = hostRef.current;

        (async () => {
            try {
                if (kind === "pdf") {
                    host.innerHTML = "";
                    await renderPdfPages(renderBuffer, host, stageWidth || host.clientWidth, zoom);
                    return;
                }

                if (kind === "docx") {
                    if (host.dataset.rendered !== "1") {
                        host.innerHTML = "";
                        host.style.transform = "none";
                        const { renderAsync } = await import("docx-preview");
                        if (cancelled) return;
                        await renderAsync(renderBuffer, host, undefined, {
                            className: "docx-preview-body",
                            inWrapper: true,
                            breakPages: true,
                        });
                        host.dataset.rendered = "1";
                    }
                    requestAnimationFrame(() => {
                        if (cancelled) return;
                        updateFitScale();
                        requestAnimationFrame(() => {
                            if (!cancelled) updateFitScale();
                        });
                    });
                    return;
                }

                if (kind === "pptx") {
                    host.innerHTML = "";
                    const { init } = await import("pptx-preview");
                    if (cancelled) return;
                    const width = Math.max(280, Math.floor((stageWidth || host.clientWidth || 640) * zoom));
                    const height = Math.max(200, Math.floor(width * 0.62));
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
    }, [status, kind, renderBuffer, zoom, stageWidth, updateFitScale]);

    useEffect(() => {
        if (status !== "ready") return;
        if (kind !== "image" && kind !== "text") return;
        const frame = requestAnimationFrame(() => updateFitScale());
        return () => cancelAnimationFrame(frame);
    }, [status, kind, objectUrl, textContent, updateFitScale, stageWidth, zoom]);

    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return undefined;
        const onWheel = (event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();
            setZoom((z) => clampZoom(z + (event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP)));
        };
        stage.addEventListener("wheel", onWheel, { passive: false });
        return () => stage.removeEventListener("wheel", onWheel);
    }, [status]);

    useEffect(() => {
        if (!usesFitScale || status !== "ready") return;
        updateFitScale();
    }, [zoom, usesFitScale, status, updateFitScale]);

    const onDownload = () => {
        if (blob) triggerBlobDownload(blob, title);
    };

    const showZoom = status === "ready" && ["pdf", "docx", "pptx", "image", "text"].includes(kind);

    return (
        <div className="doc-viewer">
            <header className="doc-viewer-bar">
                <div className="doc-viewer-title" title={title}>{title}</div>
                <div className="doc-viewer-actions">
                    {blob ? (
                        <button type="button" className="doc-viewer-btn" onClick={onDownload}>
                            <i className="fa-solid fa-download" aria-hidden="true"></i>
                            <span className="doc-viewer-btn-label">Download</span>
                        </button>
                    ) : null}
                    <button type="button" className="doc-viewer-btn" onClick={() => window.close()}>
                        <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                        <span className="doc-viewer-btn-label">Close</span>
                    </button>
                </div>
            </header>

            {showZoom ? (
                <div className="doc-viewer-toolbar">
                    <ZoomControls
                        zoom={zoom}
                        onZoomOut={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
                        onZoomIn={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                        onReset={() => setZoom(1)}
                    />
                    <span className="doc-viewer-toolbar-hint">
                        Fit {Math.round(fitScale * 100)}% · Pinch or Ctrl+scroll to zoom
                    </span>
                </div>
            ) : null}

            <div
                ref={stageRef}
                className={`doc-viewer-stage${kind === "pptx" ? " is-fill" : ""}`}
            >
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
                    <div className="doc-viewer-scale-frame">
                        <div ref={shellRef} className="doc-viewer-scale-shell">
                            <div ref={hostRef} className="doc-viewer-image-wrap">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    className="doc-viewer-image"
                                    src={objectUrl}
                                    alt={title}
                                    onLoad={() => updateFitScale()}
                                />
                            </div>
                        </div>
                    </div>
                ) : null}

                {status === "ready" && kind === "text" ? (
                    <div className="doc-viewer-scale-frame is-dark">
                        <div ref={shellRef} className="doc-viewer-scale-shell">
                            <div ref={hostRef} className="doc-viewer-text-wrap">
                                <pre className="doc-viewer-text">{textContent}</pre>
                            </div>
                        </div>
                    </div>
                ) : null}

                {status === "ready" && kind === "pdf" ? (
                    <div ref={hostRef} className="doc-viewer-pdf" />
                ) : null}

                {status === "ready" && kind === "docx" ? (
                    <div className="doc-viewer-scale-frame">
                        <div ref={shellRef} className="doc-viewer-scale-shell">
                            <div ref={hostRef} className="doc-viewer-docx" />
                        </div>
                    </div>
                ) : null}

                {status === "ready" && kind === "pptx" ? (
                    <div ref={hostRef} className="doc-viewer-pptx" />
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
