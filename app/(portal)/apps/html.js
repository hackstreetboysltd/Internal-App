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
                    if (!(child.tagName === "A" && attr.name === "href")) {
                        child.removeAttribute(attr.name);
                    }
                });
                walk(child);
            }
        });
    };
    walk(template.content);
    return template.innerHTML.trim();
}

export function stripHtml(html) {
    if (typeof document === "undefined") {
        return String(html || "").replace(/<[^>]*>/g, "").trim();
    }
    const template = document.createElement("template");
    template.innerHTML = html || "";
    return (template.content.textContent || "").trim();
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
