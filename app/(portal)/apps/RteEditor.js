'use client';

import { useEffect, useRef } from "react";

export default function RteEditor({ seedKey, initialHtml, placeholder, editorRef }) {
    const elRef = useRef(null);

    useEffect(() => {
        if (elRef.current) elRef.current.innerHTML = initialHtml || "";
    }, [seedKey, initialHtml]);

    useEffect(() => {
        editorRef.current = elRef.current;
    });

    const runCmd = (cmd) => {
        const editor = elRef.current;
        if (!editor) return;
        editor.focus();
        if (cmd === "createLink") {
            const url = prompt("Enter URL:", "https://");
            if (!url) return;
            document.execCommand("createLink", false, url);
        } else {
            document.execCommand(cmd, false, null);
        }
    };

    const tool = (cmd, title, icon) => (
        <button
            type="button"
            data-cmd={cmd}
            title={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd(cmd)}
        >
            <i className={`fas fa-${icon}`}></i>
        </button>
    );

    return (
        <div className="rte-wrapper">
            <div className="rte-toolbar">
                {tool("bold", "Bold", "bold")}
                {tool("italic", "Italic", "italic")}
                {tool("underline", "Underline", "underline")}
                <span className="rte-divider"></span>
                {tool("insertUnorderedList", "Bullet list", "list-ul")}
                {tool("insertOrderedList", "Numbered list", "list-ol")}
                <span className="rte-divider"></span>
                {tool("createLink", "Insert link", "link")}
                {tool("removeFormat", "Clear formatting", "eraser")}
            </div>
            <div
                ref={elRef}
                className="rte-editor"
                contentEditable="true"
                data-placeholder={placeholder}
                suppressContentEditableWarning
            />
        </div>
    );
}
