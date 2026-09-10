export function isSafeHref(href) {
    const raw = String(href || "").trim();
    if (!raw) return false;
    // Protocol-relative and scheme-less paths are fine; block dangerous schemes.
    if (/^\/(?!\/)/.test(raw) || raw.startsWith("#") || raw.startsWith("?")) return true;
    try {
        const url = new URL(raw, "https://example.invalid");
        return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
    } catch {
        return false;
    }
}

// Allow-list sanitizer for app descriptions. Runs on save, not on every
// keystroke, so it does not fight the user while they type.
export function sanitizeHtml(html) {
    if (typeof document === "undefined") return "";
    const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "BR", "DIV", "A", "P", "SPAN"]);
    const template = document.createElement("template");
    template.innerHTML = html || "";

    const walk = (node) => {
        [...node.childNodes].forEach((child) => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                if (!allowedTags.has(child.tagName)) {
                    while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
                    child.parentNode.removeChild(child);
                    return;
                }
                [...child.attributes].forEach((attr) => {
                    if (child.tagName === "A" && attr.name === "href") {
                        if (!isSafeHref(attr.value)) {
                            child.removeAttribute("href");
                        } else {
                            child.setAttribute("rel", "noopener noreferrer");
                        }
                        return;
                    }
                    child.removeAttribute(attr.name);
                });
                walk(child);
            }
        });
    };
    walk(template.content);
    return template.innerHTML.trim();
}

export function stripHtml(html) {
    const raw = String(html || "");
    // Insert spaces around block-ish tags so adjacent paragraphs don't glue together.
    const spaced = raw
        .replace(/<\s*br\s*\/?>/gi, " ")
        .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, " ")
        .replace(/<\s*(p|div|li|h[1-6])(\s[^>]*)?>/gi, " ");
    if (typeof document === "undefined") {
        return spaced.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    const template = document.createElement("template");
    template.innerHTML = spaced;
    return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(str) {
    if (typeof document === "undefined") return String(str || "");
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

export function getEditorHtml(el) {
    if (!el) return "";
    return sanitizeHtml(el.innerHTML);
}
