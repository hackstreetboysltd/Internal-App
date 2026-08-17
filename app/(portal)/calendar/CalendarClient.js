'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { approve, get, getCollection, reject, save, saveCollection, watch } from "@/lib/portalApi";
import { portalDateParts, portalNowIso } from "@/lib/portalTime";
import { notifyTeam } from "@/lib/emailNotify";
import { useSession, clearActiveModule } from "@/lib/session";
import BusyButton from "@/components/BusyButton";
import { useBusy } from "@/lib/useBusy";
import {
    MAX_INLINE_FILE_BYTES,
    MONTH_NAMES,
    canManageDocument,
    docIconForName,
    downloadDataUrl,
    fileToDataUrl,
    filesCollectionName,
    formatDayTitle,
    formatDocMeta,
    itemClockTime,
    itemDateStr,
    itemDocuments,
    itemHourFraction,
    matchesSearch,
    meetingStatus,
    nextItemId,
    persistableCollection,
    recordTitle,
    safeDocHref,
    todayStr,
    toDateStr,
} from "./calendarHelpers";

const ICON_BTN = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#f472b6",
    padding: 0,
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.65,
    transition: "opacity 0.2s, transform 0.2s",
};

function IconBtn({ title, onClick, className, style, hoverScale = 1.1, children }) {
    return (
        <button
            type="button"
            className={className}
            title={title}
            style={{ ...ICON_BTN, width: 32, height: 32, fontSize: "1.15rem", ...style }}
            onMouseOver={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = `scale(${hoverScale})`;
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.opacity = "0.65";
                e.currentTarget.style.transform = "scale(1)";
            }}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function ModuleModal({ open, shown, onBackdrop, children }) {
    if (!open) return null;
    return (
        <div
            className={shown ? "modal show" : "modal"}
            style={{ display: "flex" }}
            onClick={(e) => {
                if (e.target === e.currentTarget && onBackdrop) onBackdrop();
            }}
        >
            {children}
        </div>
    );
}

function Field({ id, label, style, children }) {
    return (
        <>
            <label htmlFor={id} style={{ fontSize: "0.85rem", color: "#9ca3af", display: "block", marginBottom: 6, ...style }}>{label}</label>
            {children}
        </>
    );
}

function sameId(a, b) {
    return String(a) === String(b);
}

function PendingBadge({ pendingType }) {
    if (!pendingType) return null;
    const create = pendingType === "create";
    return (
        <span
            className="badge"
            style={{
                fontSize: "0.65rem",
                padding: "2px 6px",
                marginLeft: 6,
                background: create ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)",
                color: create ? "#10b981" : "#6366f1",
                border: `1px solid ${create ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
            }}
        >
            {pendingType.toUpperCase()}
        </span>
    );
}

export default function CalendarClient() {
    const router = useRouter();
    const { actor, isAdminView } = useSession();
    const actorRef = useRef(actor);
    useEffect(() => { actorRef.current = actor; }, [actor]);

    const [loading, setLoading] = useState(true);
    const { busy: formBusy, runBusy: runFormBusy } = useBusy();
    const [events, setEvents] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [calYear, setCalYear] = useState(2026);
    const [calMonth, setCalMonth] = useState(0);
    const [today, setToday] = useState("");
    const [selectedDateStr, setSelectedDateStr] = useState(null);
    const [dayViewOpen, setDayViewOpen] = useState(false);
    const [showEvents, setShowEvents] = useState(true);
    const [showMeetings, setShowMeetings] = useState(true);
    const [refreshSpin, setRefreshSpin] = useState(false);
    const [addMenuOpen, setAddMenuOpen] = useState(false);

    const [eventOpen, setEventOpen] = useState(false);
    const [eventShown, setEventShown] = useState(false);
    const [meetingOpen, setMeetingOpen] = useState(false);
    const [meetingShown, setMeetingShown] = useState(false);
    const [eventDetailOpen, setEventDetailOpen] = useState(false);
    const [eventDetailShown, setEventDetailShown] = useState(false);
    const [meetingDetailOpen, setMeetingDetailOpen] = useState(false);
    const [meetingDetailShown, setMeetingDetailShown] = useState(false);
    const [editEventOpen, setEditEventOpen] = useState(false);
    const [editEventShown, setEditEventShown] = useState(false);
    const [editMeetingOpen, setEditMeetingOpen] = useState(false);
    const [editMeetingShown, setEditMeetingShown] = useState(false);
    const [docsOpen, setDocsOpen] = useState(false);
    const [docsShown, setDocsShown] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoShown, setInfoShown] = useState(false);

    const [evAuthor, setEvAuthor] = useState("");
    const [evTitle, setEvTitle] = useState("");
    const [evDate, setEvDate] = useState("");
    const [evLoc, setEvLoc] = useState("");
    const [mAuthor, setMAuthor] = useState("");
    const [mTime, setMTime] = useState("");
    const [mLink, setMLink] = useState("");
    const [mAgenda, setMAgenda] = useState("");

    const [editEvId, setEditEvId] = useState("");
    const [editEvAuthor, setEditEvAuthor] = useState("");
    const [editEvTitle, setEditEvTitle] = useState("");
    const [editEvDate, setEditEvDate] = useState("");
    const [editEvLoc, setEditEvLoc] = useState("");
    const [editMId, setEditMId] = useState("");
    const [editMAuthor, setEditMAuthor] = useState("");
    const [editMTime, setEditMTime] = useState("");
    const [editMLink, setEditMLink] = useState("");
    const [editMAgenda, setEditMAgenda] = useState("");

    const [viewingEventId, setViewingEventId] = useState(null);
    const [viewingMeetingId, setViewingMeetingId] = useState(null);
    const [viewingDocs, setViewingDocs] = useState(null);
    const [docPayloads, setDocPayloads] = useState([]);
    const [docName, setDocName] = useState("");
    const [docUrl, setDocUrl] = useState("");
    const [docFileLabel, setDocFileLabel] = useState("Choose a file (max 512 KB) or drop it here");
    const [docDropOver, setDocDropOver] = useState(false);
    const [postingDoc, setPostingDoc] = useState(false);
    const docFileRef = useRef(null);

    const timers = useRef([]);
    const later = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timers.current.push(id);
        return id;
    };
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const actorName = (actor?.name || "").toLowerCase();
    const isOwner = (item) => (item.author || "").toLowerCase() === actorName;

    const loadSchedule = useCallback(async () => {
        try {
            const [ev, mt] = await Promise.all([get("calendar"), get("meetings")]);
            setEvents(Array.isArray(ev) ? ev : []);
            setMeetings(Array.isArray(mt) ? mt : []);
        } catch (e) {
            console.error("Failed to load calendar.", e);
            setEvents([]);
            setMeetings([]);
        }
    }, []);

    useEffect(() => {
        const now = portalDateParts();
        setCalYear(now.year);
        setCalMonth(now.month - 1);
        setToday(todayStr());
        setLoading(true);
        const seen = new Set();
        const mark = (key) => {
            seen.add(key);
            if (seen.size >= 2) setLoading(false);
        };
        const u1 = watch("calendar", (ev) => {
            setEvents(Array.isArray(ev) ? ev : []);
            mark("calendar");
        }, {
            onError: (e) => {
                console.error("Failed to load calendar.", e);
                setEvents([]);
                mark("calendar");
            },
        });
        const u2 = watch("meetings", (mt) => {
            setMeetings(Array.isArray(mt) ? mt : []);
            mark("meetings");
        }, {
            onError: (e) => {
                console.error("Failed to load calendar.", e);
                setMeetings([]);
                mark("meetings");
            },
        });
        return () => {
            u1();
            u2();
        };
    }, []);

    const saveEvents = async (list) => {
        try {
            await save("calendar", persistableCollection(list));
        } catch (e) {
            console.error("Failed database write.", e);
            alert("Failed to save event. Ensure you have an active internet connection.");
            throw e;
        }
    };

    const saveMeetings = async (list) => {
        try {
            await save("meetings", persistableCollection(list));
        } catch (e) {
            console.error("Failed database write.", e);
            alert("Failed to save meetings to physical database server.");
            throw e;
        }
    };

    const schedule = useMemo(() => [
        ...events.map((e) => ({ ...e, kind: "event" })),
        ...meetings.map((m) => ({ ...m, kind: "meeting" })),
    ], [events, meetings]);

    const q = searchQuery.toLowerCase().trim();
    const items = schedule.filter((item) => {
        if (item.kind === "event" && !showEvents) return false;
        if (item.kind === "meeting" && !showMeetings) return false;
        return matchesSearch(item, q);
    });

    const closeModule = () => {
        clearActiveModule();
        router.push("/");
    };

    const openModal = (setOpen, setShown) => {
        setOpen(true);
        later(() => setShown(true), 10);
    };
    const closeModal = (setOpen, setShown, after) => {
        setShown(false);
        later(() => {
            setOpen(false);
            if (after) after();
        }, 300);
    };

    const toggleKindFilter = (kind) => {
        let nextEvents = showEvents;
        let nextMeetings = showMeetings;
        if (kind === "event") nextEvents = !nextEvents;
        if (kind === "meeting") nextMeetings = !nextMeetings;
        if (!nextEvents && !nextMeetings) {
            if (kind === "event") nextEvents = true;
            else nextMeetings = true;
        }
        setShowEvents(nextEvents);
        setShowMeetings(nextMeetings);
    };

    const changeMonth = (direction) => {
        let month = calMonth + direction;
        let year = calYear;
        if (month < 0) {
            month = 11;
            year -= 1;
        } else if (month > 11) {
            month = 0;
            year += 1;
        }
        setCalMonth(month);
        setCalYear(year);
        setSelectedDateStr(null);
    };

    const jumpToToday = () => {
        const now = portalDateParts();
        setCalYear(now.year);
        setCalMonth(now.month - 1);
        setToday(todayStr());
        if (dayViewOpen) closeDayView();
    };

    const refreshCalendar = async () => {
        setRefreshSpin(true);
        setToday(todayStr());
        try {
            await loadSchedule();
        } catch (e) {
            console.error("Error during calendar refresh:", e);
        } finally {
            later(() => setRefreshSpin(false), 500);
        }
    };

    const openDayView = (dateStr) => {
        setDayViewOpen(true);
        setSelectedDateStr(dateStr);
    };

    const closeDayView = () => {
        setDayViewOpen(false);
        setSelectedDateStr(null);
    };

    const openAddEvent = () => {
        setAddMenuOpen(false);
        setEvAuthor("");
        setEvTitle("");
        setEvDate(selectedDateStr || "");
        setEvLoc("");
        openModal(setEventOpen, setEventShown);
    };

    const openAddMeeting = () => {
        setAddMenuOpen(false);
        setMAuthor("");
        setMTime(selectedDateStr ? `${selectedDateStr}T09:00` : "");
        setMLink("");
        setMAgenda("");
        openModal(setMeetingOpen, setMeetingShown);
    };

    const addEvent = () => runFormBusy(async () => {
        const author = evAuthor.trim();
        const title = evTitle.trim();
        const date = evDate;
        const loc = evLoc.trim();
        if (!author || !title || !date || !loc) return alert("Please complete all form fields");

        const list = persistableCollection(await get("calendar"));
        list.push({ id: nextItemId(), author, title, date, loc, documents: [] });
        setSelectedDateStr(date);
        const [y, m] = date.split("-").map(Number);
        setCalYear(y);
        setCalMonth(m - 1);
        setDayViewOpen(true);
        await saveEvents(list);

        const current = actorRef.current || { name: "A Team Member", email: "" };
        notifyTeam({
            action: "added",
            actorName: current.name,
            itemName: `${title} (${date})`,
            module: "Calendar",
            excludeEmail: current.email,
        });
        setEvAuthor(""); setEvTitle(""); setEvDate(""); setEvLoc("");
        closeModal(setEventOpen, setEventShown);
    });

    const addMeeting = () => runFormBusy(async () => {
        const author = mAuthor.trim();
        const time = mTime;
        const link = mLink.trim();
        const agenda = mAgenda.trim();
        if (!author || !time || !link || !agenda) return alert("Fill in all fields");

        const list = persistableCollection(await get("meetings"));
        list.push({ id: nextItemId(), author, time, link, agenda, minutes: "", documents: [] });
        const dateStr = toDateStr(time);
        setSelectedDateStr(dateStr);
        const [y, m] = dateStr.split("-").map(Number);
        setCalYear(y);
        setCalMonth(m - 1);
        setDayViewOpen(true);
        await saveMeetings(list);

        const current = actorRef.current || { name: "A Team Member", email: "" };
        notifyTeam({
            action: "added",
            actorName: current.name,
            itemName: `meeting on ${new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
            module: "Calendar",
            excludeEmail: current.email,
        });
        setMAuthor(""); setMTime(""); setMLink(""); setMAgenda("");
        closeModal(setMeetingOpen, setMeetingShown);
    });

    const saveEditEvent = () => runFormBusy(async () => {
        const id = parseInt(editEvId, 10);
        const author = editEvAuthor.trim();
        const title = editEvTitle.trim();
        const date = editEvDate;
        const loc = editEvLoc.trim();
        if (!author || !title || !date || !loc) return alert("Please complete all form fields");

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = persistableCollection(await get("calendar"));
        const item = list.find((ev) => sameId(ev.id, id));
        if (!item) return;
        if ((item.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own events.");
            return;
        }
        item.author = author;
        item.title = title;
        item.date = date;
        item.loc = loc;
        setSelectedDateStr(date);
        await saveEvents(list);
        notifyTeam({
            action: "edited",
            actorName: current.name,
            itemName: `${title} (${date})`,
            module: "Calendar",
            excludeEmail: current.email,
        });
        closeModal(setEditEventOpen, setEditEventShown);
    });

    const saveEditMeeting = () => runFormBusy(async () => {
        const id = parseInt(editMId, 10);
        const author = editMAuthor.trim();
        const time = editMTime;
        const link = editMLink.trim();
        const agenda = editMAgenda.trim();
        if (!author || !time || !link || !agenda) return alert("Fill in all fields");

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = persistableCollection(await get("meetings"));
        const item = list.find((m) => sameId(m.id, id));
        if (!item) return;
        if ((item.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only edit your own meetings.");
            return;
        }
        item.author = author;
        item.time = time;
        item.link = link;
        item.agenda = agenda;
        setSelectedDateStr(toDateStr(time));
        await saveMeetings(list);
        notifyTeam({
            action: "edited",
            actorName: current.name,
            itemName: `meeting on ${new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
            module: "Calendar",
            excludeEmail: current.email,
        });
        closeModal(setEditMeetingOpen, setEditMeetingShown);
    });

    const deleteEvent = async (id) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = persistableCollection(await get("calendar"));
        const deletedEvent = list.find((ev) => sameId(ev.id, id));
        if (deletedEvent && (deletedEvent.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only delete your own events.");
            return;
        }
        if (!confirm("Are you sure you want to remove this event from the calendar?")) return;
        try {
            await saveCollection(filesCollectionName("event", deletedEvent && deletedEvent.id), []);
        } catch (e) {
            console.warn("Could not clear attached files.", e);
        }
        const filtered = list.filter((ev) => !sameId(ev.id, id));
        closeModal(setEventDetailOpen, setEventDetailShown, () => setViewingEventId(null));
        if (viewingDocs && sameId(viewingDocs.id, id)) closeModal(setDocsOpen, setDocsShown, () => setViewingDocs(null));
        await saveEvents(filtered);
        notifyTeam({
            action: "deleted",
            actorName: current.name,
            itemName: deletedEvent ? `${deletedEvent.title} (${deletedEvent.date})` : "a calendar event",
            module: "Calendar",
            excludeEmail: current.email,
        });
    };

    const deleteMeeting = async (id) => {
        const current = actorRef.current || { name: "A Team Member", email: "" };
        const list = persistableCollection(await get("meetings"));
        const deletedMeeting = list.find((m) => sameId(m.id, id));
        if (deletedMeeting && (deletedMeeting.author || "").toLowerCase() !== current.name.toLowerCase()) {
            alert("Permission Denied: You can only delete your own meetings.");
            return;
        }
        if (!confirm("Are you sure you want to delete this meeting?")) return;
        try {
            await saveCollection(filesCollectionName("meeting", deletedMeeting && deletedMeeting.id), []);
        } catch (e) {
            console.warn("Could not clear attached files.", e);
        }
        const filtered = list.filter((m) => !sameId(m.id, id));
        closeModal(setMeetingDetailOpen, setMeetingDetailShown, () => setViewingMeetingId(null));
        if (viewingDocs && sameId(viewingDocs.id, id)) closeModal(setDocsOpen, setDocsShown, () => setViewingDocs(null));
        await saveMeetings(filtered);
        notifyTeam({
            action: "deleted",
            actorName: current.name,
            itemName: deletedMeeting
                ? `meeting on ${new Date(deletedMeeting.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : "a meeting",
            module: "Calendar",
            excludeEmail: current.email,
        });
    };

    const openEditEvent = async (evId) => {
        const list = await get("calendar");
        const item = (Array.isArray(list) ? list : []).find((ev) => sameId(ev.id, evId));
        if (!item) return;
        if (!isOwner(item)) {
            alert("Permission Denied: You can only edit your own events.");
            return;
        }
        setEditEvId(String(item.id));
        setEditEvAuthor(item.author || "");
        setEditEvTitle(item.title || "");
        setEditEvDate(item.date || "");
        setEditEvLoc(item.loc || "");
        openModal(setEditEventOpen, setEditEventShown);
    };

    const openEditMeeting = async (mId) => {
        const list = await get("meetings");
        const item = (Array.isArray(list) ? list : []).find((m) => sameId(m.id, mId));
        if (!item) return;
        if (!isOwner(item)) {
            alert("Permission Denied: You can only edit your own meetings.");
            return;
        }
        setEditMId(String(item.id));
        setEditMAuthor(item.author || "");
        setEditMTime(item.time || "");
        setEditMLink(item.link || "");
        setEditMAgenda(item.agenda || "");
        openModal(setEditMeetingOpen, setEditMeetingShown);
    };

    const addMinutesInModal = async () => {
        if (!viewingMeetingId) return;
        const list = persistableCollection(await get("meetings"));
        const item = list.find((m) => sameId(m.id, viewingMeetingId));
        if (!item) return;
        if (!isOwner(item)) {
            alert("Permission Denied: You can only add/update minutes for meetings you organized.");
            return;
        }
        const minutes = prompt("Add/Update post-meeting minutes:", item.minutes || "");
        if (minutes === null) return;
        item.minutes = minutes.trim();
        await saveMeetings(list);
    };

    const approvePending = async (id, kind) => {
        const label = kind === "meeting" ? "scheduled meeting" : "calendar event";
        if (!confirm(`Approve this ${label}?`)) return;
        try {
            await approve(kind === "meeting" ? "meetings" : "calendar", id);
            closeModal(setEventDetailOpen, setEventDetailShown, () => setViewingEventId(null));
            closeModal(setMeetingDetailOpen, setMeetingDetailShown, () => setViewingMeetingId(null));
            await loadSchedule();
        } catch (e) {
            console.error(e);
            alert(`Failed to approve ${kind}.`);
        }
    };

    const rejectPending = async (id, kind) => {
        const label = kind === "meeting" ? "scheduled meeting" : "calendar event";
        if (!confirm(`Reject and discard this ${label}?`)) return;
        try {
            await reject(kind === "meeting" ? "meetings" : "calendar", id);
            closeModal(setEventDetailOpen, setEventDetailShown, () => setViewingEventId(null));
            closeModal(setMeetingDetailOpen, setMeetingDetailShown, () => setViewingMeetingId(null));
            await loadSchedule();
        } catch (e) {
            console.error(e);
            alert(`Failed to reject ${kind}.`);
        }
    };

    const resetDocForm = () => {
        setDocName("");
        setDocUrl("");
        setDocFileLabel("Choose a file (max 512 KB) or drop it here");
        if (docFileRef.current) docFileRef.current.value = "";
    };

    const loadDocs = async (kind, id) => {
        try {
            const data = await getCollection(filesCollectionName(kind, id));
            setDocPayloads(Array.isArray(data) ? data : []);
        } catch (e) {
            console.warn("Could not load attached files.", e);
            setDocPayloads([]);
        }
    };

    const openDocumentsModal = async (kind, id) => {
        setViewingDocs({ kind, id });
        resetDocForm();
        openModal(setDocsOpen, setDocsShown);
        await loadDocs(kind, id);
    };

    const onDocFileChosen = (file) => {
        if (!file) {
            setDocFileLabel("Choose a file (max 512 KB) or drop it here");
            return;
        }
        setDocFileLabel(file.name);
        setDocName((prev) => prev.trim() ? prev : (file.name.replace(/\.[^.]+$/, "") || file.name));
    };

    const postRecordDocument = async () => {
        if (!viewingDocs) return;
        const file = docFileRef.current && docFileRef.current.files && docFileRef.current.files[0];
        let name = docName.trim() || (file && file.name) || "";
        let url = docUrl.trim() || "";
        if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
        if (!name) return alert("Give the document a name.");
        if (!file && !url) return alert("Attach a file or paste a link.");
        if (file && file.size > MAX_INLINE_FILE_BYTES) {
            return alert("This file is larger than 512 KB. Upload it to Drive and paste the share link instead.");
        }

        const list = viewingDocs.kind === "meeting" ? await get("meetings") : await get("calendar");
        const item = (Array.isArray(list) ? list : []).find((r) => sameId(r.id, viewingDocs.id));
        if (!item) return alert("This record is no longer available.");
        if (item.pendingType) return alert("Documents can be posted after this record is approved.");
        const listToSave = persistableCollection(list);
        if (!listToSave.some((r) => sameId(r.id, item.id))) {
            return alert("Documents can be posted after this record is approved.");
        }

        const current = actorRef.current || { name: "A Team Member", email: "" };
        const docId = nextItemId();
        setPostingDoc(true);
        try {
            let finalUrl = url;
            if (file) {
                const dataUrl = await fileToDataUrl(file);
                const payloads = await getCollection(filesCollectionName(viewingDocs.kind, item.id));
                const nextPayloads = Array.isArray(payloads) ? payloads.slice() : [];
                nextPayloads.push({ id: docId, name, dataUrl });
                await saveCollection(filesCollectionName(viewingDocs.kind, item.id), nextPayloads);
                finalUrl = "";
            }
            if (!file && !finalUrl) {
                alert("Attach a file or paste a link.");
                return;
            }
            if (!Array.isArray(item.documents)) item.documents = [];
            item.documents.push({
                id: docId,
                name,
                url: finalUrl,
                hasFile: !!file,
                postedBy: current.name,
                postedAt: portalNowIso(),
            });
            if (viewingDocs.kind === "meeting") await saveMeetings(listToSave);
            else await saveEvents(listToSave);
            notifyTeam({
                action: "added",
                actorName: current.name,
                itemName: `document "${name}" on ${recordTitle({ ...item, kind: viewingDocs.kind })}`,
                module: "Calendar",
                excludeEmail: current.email,
            });
            resetDocForm();
            await loadDocs(viewingDocs.kind, item.id);
        } catch (e) {
            console.error("Document post failed.", e);
            alert("Could not post this document. Try a smaller file or paste a link.");
        } finally {
            setPostingDoc(false);
        }
    };

    const deleteRecordDocument = async (docId) => {
        if (!viewingDocs) return;
        const list = viewingDocs.kind === "meeting" ? await get("meetings") : await get("calendar");
        const item = (Array.isArray(list) ? list : []).find((r) => sameId(r.id, viewingDocs.id));
        if (!item) return;
        const docs = itemDocuments(item);
        const doc = docs.find((d) => sameId(d.id, docId));
        if (!doc) return;
        if (!canManageDocument(item, doc, actorRef.current?.name)) {
            alert("You can only remove documents you posted, or documents on your own record.");
            return;
        }
        if (!confirm(`Remove "${doc.name || "this document"}"?`)) return;
        item.documents = docs.filter((d) => !sameId(d.id, docId));
        const listToSave = persistableCollection(list);
        try {
            const payloads = (await getCollection(filesCollectionName(viewingDocs.kind, item.id)) || [])
                .filter((p) => !sameId(p.id, docId));
            await saveCollection(filesCollectionName(viewingDocs.kind, item.id), payloads);
            if (viewingDocs.kind === "meeting") await saveMeetings(listToSave);
            else await saveEvents(listToSave);
            await loadDocs(viewingDocs.kind, item.id);
        } catch (e) {
            console.error("Failed to remove document.", e);
            alert("Could not remove this document.");
        }
    };

    const openPostedDocument = (doc) => {
        const payload = docPayloads.find((p) => sameId(p.id, doc.id));
        if (payload && payload.dataUrl) {
            downloadDataUrl(payload.dataUrl, payload.name || "document");
            return;
        }
        const href = safeDocHref((payload && payload.url) || doc.url);
        if (href) window.open(href, "_blank", "noopener");
    };

    const viewingEvent = events.find((e) => sameId(e.id, viewingEventId));
    const viewingMeeting = meetings.find((m) => sameId(m.id, viewingMeetingId));
    const docsRecord = viewingDocs
        ? (viewingDocs.kind === "meeting" ? meetings : events).find((r) => sameId(r.id, viewingDocs.id))
        : null;
    const docsList = docsRecord ? itemDocuments(docsRecord) : [];

    const gridCells = [];
    if (!loading) {
        const firstOfMonth = new Date(calYear, calMonth, 1);
        const startOffset = firstOfMonth.getDay();
        const gridStart = new Date(calYear, calMonth, 1 - startOffset);
        for (let i = 0; i < 42; i++) {
            const cellDate = new Date(gridStart);
            cellDate.setDate(gridStart.getDate() + i);
            const y = cellDate.getFullYear();
            const m = cellDate.getMonth();
            const d = cellDate.getDate();
            const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const inMonth = m === calMonth;
            const dayItems = items.filter((item) => itemDateStr(item) === dateStr);
            gridCells.push({
                key: dateStr + "-" + i,
                dateStr,
                d,
                y,
                m,
                inMonth,
                isToday: dateStr === today,
                isSelected: selectedDateStr === dateStr,
                hasEvent: dayItems.some((item) => item.kind === "event"),
                hasMeeting: dayItems.some((item) => item.kind === "meeting"),
            });
        }
    }

    const dayItems = selectedDateStr
        ? items.filter((item) => itemDateStr(item) === selectedDateStr).slice().sort((a, b) => {
            const aFrac = itemHourFraction(a);
            const bFrac = itemHourFraction(b);
            if (aFrac === null && bFrac === null) return 0;
            if (aFrac === null) return -1;
            if (bFrac === null) return 1;
            return aFrac - bFrac;
        })
        : [];

    const hourMarks = [0, 3, 6, 9, 12, 15, 18, 21];
    const viewingMeetingStatus = viewingMeeting ? meetingStatus(viewingMeeting.time) : null;
    const viewingMeetingOwner = viewingMeeting ? isOwner(viewingMeeting) : false;

    return (
        <div className="calendar-module" onClick={() => { if (addMenuOpen) setAddMenuOpen(false); }}>
            <div className="container">
                <div className="header-container" style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "center", marginBottom: 24, borderBottom: "1px solid var(--border-color)", paddingBottom: 16 }}>
                    {dayViewOpen ? (
                        <button
                            type="button"
                            className="cal-back-btn"
                            title="Back to calendar"
                            onClick={closeDayView}
                        >
                            <i className="fa-solid fa-arrow-left"></i>
                        </button>
                    ) : (
                        <div></div>
                    )}
                    <h2 style={{ margin: "0 auto", borderBottom: "none", paddingBottom: 0, fontSize: "1.8rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <span style={dayViewOpen ? { color: "#f472b6", fontSize: "1.35rem" } : undefined}>
                            {dayViewOpen && selectedDateStr ? formatDayTitle(selectedDateStr) : "Calendar"}
                        </span>
                        {!dayViewOpen ? (
                            <IconBtn title="About this module" onClick={() => openModal(setInfoOpen, setInfoShown)} style={{ width: "auto", height: "auto", fontSize: "1rem" }} hoverScale={1.15}>
                                <i className="fa-solid fa-circle-info"></i>
                            </IconBtn>
                        ) : null}
                    </h2>
                    <div className="header-actions-right" style={{ display: "flex", alignItems: "center", gap: 4, justifySelf: "end" }}>
                        {!isAdminView ? (
                            <IconBtn className="refresh-btn" title="Refresh calendar" onClick={refreshCalendar}>
                                <i className={`fa-solid fa-arrows-rotate${refreshSpin ? " fa-spin" : ""}`}></i>
                            </IconBtn>
                        ) : null}
                        <IconBtn className="close-module-btn" title="Close module" onClick={closeModule}>
                            <i className="fa-solid fa-xmark"></i>
                        </IconBtn>
                    </div>
                </div>

                <div className="header-actions" style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "center", justifyContent: dayViewOpen ? "flex-end" : undefined }}>
                    {!dayViewOpen ? (
                        <div className="search-input-wrapper" style={{ flex: 1 }}>
                            <input type="text" placeholder="Search events and meetings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                    ) : null}
                    <div className="header-actions-primary" onClick={(e) => e.stopPropagation()}>
                        <div className="header-actions-menu">
                            <button
                                type="button"
                                onClick={() => setAddMenuOpen((v) => !v)}
                                style={{ width: "auto", padding: "10px 18px", fontSize: "0.9rem", background: "#f472b6", borderColor: "#f472b6", color: "white" }}
                            >
                                <i className="fa-solid fa-plus"></i> Add
                            </button>
                            <div className={addMenuOpen ? "add-menu show" : "add-menu"}>
                                <button type="button" onClick={openAddEvent}><i className="fa-regular fa-calendar" style={{ color: "#f472b6" }}></i> Event</button>
                                <button type="button" onClick={openAddMeeting}><i className="fa-solid fa-video" style={{ color: "#818cf8" }}></i> Meeting</button>
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div aria-busy="true" aria-label="Loading calendar">
                        <div className="cal-nav">
                            <div className="cal-nav-btn" style={{ opacity: 0.3 }}></div>
                            <div className="skel-line w40" style={{ height: 22, width: 160, margin: "0 auto" }}></div>
                            <div className="cal-nav-btn" style={{ opacity: 0.3 }}></div>
                        </div>
                        <div className="cal-skeleton">
                            {Array.from({ length: 35 }).map((_, i) => <div key={i} className="skel-day"></div>)}
                        </div>
                    </div>
                ) : (
                    <div>
                        <div id="monthView" style={{ display: dayViewOpen ? "none" : undefined }}>
                            <div className="cal-nav">
                                <button type="button" className="cal-nav-btn" title="Previous month" onClick={() => changeMonth(-1)}><i className="fa-solid fa-chevron-left"></i></button>
                                <button type="button" className="cal-month-btn" title="Jump to today" onClick={jumpToToday}>{MONTH_NAMES[calMonth]} {calYear}</button>
                                <button type="button" className="cal-nav-btn" title="Next month" onClick={() => changeMonth(1)}><i className="fa-solid fa-chevron-right"></i></button>
                            </div>
                            <div className="cal-legend">
                                <button type="button" className={`cal-legend-item${showEvents ? " active" : " dimmed"}`} onClick={() => toggleKindFilter("event")}>
                                    <span className="cal-dot event"></span> Events
                                </button>
                                <button type="button" className={`cal-legend-item${showMeetings ? " active" : " dimmed"}`} onClick={() => toggleKindFilter("meeting")}>
                                    <span className="cal-dot meeting"></span> Meetings
                                </button>
                            </div>
                            <div className="cal-weekdays">
                                <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
                            </div>
                            <div className="cal-grid">
                                {gridCells.map((cell) => (
                                    <div
                                        key={cell.key}
                                        className={`cal-day${!cell.inMonth ? " is-outside" : ""}${cell.isToday ? " is-today" : ""}${cell.isSelected ? " is-selected" : ""}`}
                                        onClick={() => {
                                            if (!cell.inMonth) {
                                                setCalYear(cell.y);
                                                setCalMonth(cell.m);
                                            }
                                            openDayView(cell.dateStr);
                                        }}
                                    >
                                        <span className="cal-day-num">{cell.d}</span>
                                        <div className="cal-day-dots">
                                            {cell.hasEvent ? <span className="cal-dot event"></span> : null}
                                            {cell.hasMeeting ? <span className="cal-dot meeting"></span> : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div id="dayView" style={{ display: dayViewOpen ? undefined : "none" }}>
                            <div className="day-timeline">
                                <div className="day-timeline-track">
                                    <div className="day-timeline-line"></div>
                                    <div>
                                        {dayItems.map((item) => {
                                            const frac = itemHourFraction(item);
                                            if (frac === null) return null;
                                            return (
                                                <div
                                                    key={`${item.kind}-${item.id}`}
                                                    className={`day-timeline-dot ${item.kind}`}
                                                    style={{ left: `${Math.min(100, Math.max(0, frac * 100))}%` }}
                                                    title={`${item.kind === "meeting" ? (item.agenda || "Meeting") : (item.title || "Event")} · ${itemClockTime(item)}`}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="day-timeline-labels">
                                    {hourMarks.map((h, i) => {
                                        const suffix = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
                                        const style = i === 0
                                            ? { left: 0, transform: "translateX(0)" }
                                            : i === hourMarks.length - 1
                                                ? { left: `${(h / 24) * 100}%`, transform: "translateX(-100%)" }
                                                : { left: `${(h / 24) * 100}%` };
                                        return <span key={h} style={style}>{suffix}</span>;
                                    })}
                                </div>
                            </div>
                            <div id="dayCards">
                                {dayItems.length === 0 ? (
                                    <p style={{ fontSize: "0.85rem", color: "#6b7280", fontStyle: "italic", margin: "8px auto 0", textAlign: "center", maxWidth: 480 }}>Nothing scheduled for this date. Use Add to create an event or meeting.</p>
                                ) : dayItems.map((item) => {
                                    const title = item.kind === "meeting" ? (item.agenda || "Meeting") : (item.title || "Event");
                                    const timeLabel = itemClockTime(item);
                                    const place = item.kind === "meeting" ? (item.author || "Anonymous") : (item.loc || item.author || "Anonymous");
                                    const docs = itemDocuments(item);
                                    return (
                                        <div
                                            key={`${item.kind}-${item.pendingId || item.id}`}
                                            className={`day-card ${item.kind}`}
                                            onClick={() => {
                                                if (item.kind === "meeting") {
                                                    setViewingMeetingId(item.id);
                                                    openModal(setMeetingDetailOpen, setMeetingDetailShown);
                                                } else {
                                                    setViewingEventId(item.id);
                                                    openModal(setEventDetailOpen, setEventDetailShown);
                                                }
                                            }}
                                        >
                                            <div className="day-card-time">{timeLabel}</div>
                                            <div className="day-card-body">
                                                <strong>{title}<PendingBadge pendingType={item.pendingType} /></strong>
                                                <span>{place} · {timeLabel}</span>
                                            </div>
                                            <div className="day-card-actions">
                                                <button
                                                    type="button"
                                                    className={`day-card-docs${docs.length ? " has-docs" : ""}`}
                                                    title="Documents"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDocumentsModal(item.kind, item.id);
                                                    }}
                                                >
                                                    <i className="fa-solid fa-file-lines"></i>
                                                    {docs.length ? <span className="day-card-docs-count">{docs.length}</span> : null}
                                                </button>
                                                <i className={`${item.kind === "meeting" ? "fa-solid fa-video" : "fa-regular fa-calendar"} day-card-icon`}></i>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ModuleModal open={eventDetailOpen} shown={eventDetailShown} onBackdrop={() => closeModal(setEventDetailOpen, setEventDetailShown, () => setViewingEventId(null))}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#f472b6" }}>{viewingEvent?.title || "Event"}</h3>
                        <span className="close-btn" onClick={() => closeModal(setEventDetailOpen, setEventDetailShown, () => setViewingEventId(null))}>&times;</span>
                    </div>
                    {viewingEvent ? (
                        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            <div style={{ fontSize: "0.85rem", color: "#9ca3af", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
                                <span>Organizer: <strong>{viewingEvent.author || "Anonymous"}</strong></span>
                                {viewingEvent.date === today ? <span className="badge danger" style={{ fontSize: "0.7rem", background: "#ef4444", padding: "1px 4px", borderRadius: 3, color: "white" }}> TODAY</span> : null}
                            </div>
                            <p style={{ margin: 0, color: "#e5e7eb", fontSize: "0.95rem" }}>
                                <strong>Date:</strong> {new Date(viewingEvent.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                            </p>
                            <p style={{ margin: 0, fontSize: "0.95rem", color: "#cbd5e1", display: "flex", alignItems: "center", gap: 6 }}>
                                <strong>Location/Link:</strong>
                                <span>
                                    {(viewingEvent.loc || "").startsWith("http://") || (viewingEvent.loc || "").startsWith("https://")
                                        ? <a href={viewingEvent.loc} target="_blank" rel="noreferrer" style={{ color: "#f472b6", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>{viewingEvent.loc}</a>
                                        : viewingEvent.loc}
                                </span>
                            </p>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(244,114,182,0.1)", color: "#f472b6", marginBottom: 0, border: "1px solid rgba(244,114,182,0.15)" }} onClick={() => openDocumentsModal("event", viewingEvent.id)}>
                                    <i className="fa-solid fa-file-lines"></i> Documents
                                </button>
                                {isAdminView && viewingEvent.pendingId ? (
                                    <>
                                        <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", marginBottom: 0, border: "1px solid rgba(16, 185, 129, 0.2)" }} onClick={() => approvePending(viewingEvent.pendingId, "event")}>Approve</button>
                                        <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", marginBottom: 0, border: "1px solid rgba(239, 68, 68, 0.2)" }} onClick={() => rejectPending(viewingEvent.pendingId, "event")}>Reject</button>
                                    </>
                                ) : !isAdminView && isOwner(viewingEvent) ? (
                                    <>
                                        <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(244, 114, 182, 0.1)", color: "#f472b6", marginBottom: 0, border: "1px solid rgba(244, 114, 182, 0.15)" }} onClick={() => openEditEvent(viewingEvent.id)}><i className="fa-solid fa-pen"></i> Edit</button>
                                        <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: 0, border: "1px solid rgba(239, 68, 68, 0.15)" }} onClick={() => deleteEvent(viewingEvent.id)}><i className="fa-solid fa-trash"></i> Delete</button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </ModuleModal>

            <ModuleModal open={meetingDetailOpen} shown={meetingDetailShown} onBackdrop={() => closeModal(setMeetingDetailOpen, setMeetingDetailShown, () => setViewingMeetingId(null))}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#818cf8" }}>
                            {viewingMeetingStatus
                                ? viewingMeetingStatus.mDate.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                                : "Meeting"}
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setMeetingDetailOpen, setMeetingDetailShown, () => setViewingMeetingId(null))}>&times;</span>
                    </div>
                    {viewingMeeting && viewingMeetingStatus ? (
                            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <div style={{ fontSize: "0.85rem", color: "#9ca3af", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
                                    <span>Organizer: <strong>{viewingMeeting.author || "Anonymous"}</strong></span>
                                    <span className={`badge ${viewingMeetingStatus.badgeClass}`}>{viewingMeetingStatus.statusBadge}</span>
                                </div>
                                <p style={{ margin: 0, color: "#e5e7eb", fontSize: "0.95rem" }}>
                                    <strong>Agenda:</strong> <span style={{ whiteSpace: "pre-line" }}>{viewingMeeting.agenda}</span>
                                </p>
                                <div style={{ margin: "4px 0" }}>
                                    <a href={viewingMeeting.link} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-block" }}>
                                        <button type="button" className="secondary-btn" style={{ padding: "6px 12px", fontSize: "0.8rem", width: "auto", borderRadius: 6, color: "#818cf8", background: "rgba(129, 140, 248, 0.1)", borderColor: "rgba(129,140,248,0.2)" }}>Join Meeting Link</button>
                                    </a>
                                </div>
                                <div style={{ background: "rgba(0, 0, 0, 0.2)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.03)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#9ca3af" }}>Post-Meeting Minutes</span>
                                        {(isAdminView || viewingMeetingOwner) ? (
                                            <button type="button" className="secondary-btn" style={{ padding: "4px 8px", fontSize: "0.75rem", width: "auto", borderRadius: 6 }} onClick={addMinutesInModal}>
                                                <i className="fa-solid fa-pencil"></i> Edit Minutes
                                            </button>
                                        ) : null}
                                    </div>
                                    <p style={{ margin: 0, fontSize: "0.88rem", color: viewingMeeting.minutes ? "#10b981" : "#6b7280", fontStyle: viewingMeeting.minutes ? "normal" : "italic" }}>
                                        {viewingMeeting.minutes ? viewingMeeting.minutes : "Pending meeting completion - Minutes not yet entered."}
                                    </p>
                                </div>
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                    <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(129,140,248,0.1)", color: "#818cf8", marginBottom: 0, border: "1px solid rgba(129,140,248,0.15)" }} onClick={() => openDocumentsModal("meeting", viewingMeeting.id)}>
                                        <i className="fa-solid fa-file-lines"></i> Documents
                                    </button>
                                    {isAdminView && viewingMeeting.pendingId ? (
                                        <>
                                            <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", marginBottom: 0, border: "1px solid rgba(16, 185, 129, 0.2)" }} onClick={() => approvePending(viewingMeeting.pendingId, "meeting")}>Approve</button>
                                            <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", marginBottom: 0, border: "1px solid rgba(239, 68, 68, 0.2)" }} onClick={() => rejectPending(viewingMeeting.pendingId, "meeting")}>Reject</button>
                                        </>
                                    ) : !isAdminView && viewingMeetingOwner ? (
                                        <>
                                            <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(129, 140, 248, 0.1)", color: "#818cf8", marginBottom: 0, border: "1px solid rgba(129, 140, 248, 0.15)" }} onClick={() => openEditMeeting(viewingMeeting.id)}><i className="fa-solid fa-pen"></i> Edit</button>
                                            <button type="button" className="secondary-btn" style={{ padding: "6px 10px", fontSize: "0.75rem", width: "auto", borderRadius: 6, background: "rgba(239,68,68,0.1)", color: "#ef4444", marginBottom: 0, border: "1px solid rgba(239, 68, 68, 0.15)" }} onClick={() => deleteMeeting(viewingMeeting.id)}><i className="fa-solid fa-trash"></i> Delete</button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                    ) : null}
                </div>
            </ModuleModal>

            <ModuleModal open={eventOpen} shown={eventShown} onBackdrop={() => closeModal(setEventOpen, setEventShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#f472b6" }}>Add Event</h3>
                        <span className="close-btn" onClick={() => closeModal(setEventOpen, setEventShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <Field id="evAuthor" label="Organizer Name"><input type="text" id="evAuthor" placeholder="e.g. Alice" value={evAuthor} onChange={(e) => setEvAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="evTitle" label="Event Name" style={{ marginTop: 14 }}><input type="text" id="evTitle" placeholder="e.g. Q3 All Hands Sync" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="evDate" label="Event Date" style={{ marginTop: 14 }}><input type="date" id="evDate" value={evDate} onChange={(e) => setEvDate(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="evLoc" label="Location / Virtual Link" style={{ marginTop: 14 }}><input type="text" id="evLoc" placeholder="e.g. Google Meet URL or conference room name" value={evLoc} onChange={(e) => setEvLoc(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <BusyButton type="button" busy={formBusy} busyLabel="Adding…" onClick={addEvent} style={{ marginTop: 20, background: "#f472b6", borderColor: "#f472b6", fontWeight: 600, width: "100%" }}>Add to Calendar</BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={meetingOpen} shown={meetingShown} onBackdrop={() => closeModal(setMeetingOpen, setMeetingShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#818cf8" }}>Schedule Meeting</h3>
                        <span className="close-btn" onClick={() => closeModal(setMeetingOpen, setMeetingShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <Field id="mAuthor" label="Your Name"><input type="text" id="mAuthor" placeholder="e.g. Alice" value={mAuthor} onChange={(e) => setMAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="mTime" label="Date & Time" style={{ marginTop: 14 }}><input type="datetime-local" id="mTime" value={mTime} onChange={(e) => setMTime(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="mLink" label="Meeting URL" style={{ marginTop: 14 }}><input type="url" id="mLink" placeholder="e.g. https://meet.google.com/abc-defg-hij" value={mLink} onChange={(e) => setMLink(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="mAgenda" label="Meeting Agenda" style={{ marginTop: 14 }}><textarea id="mAgenda" placeholder="Specify key topics and goals..." value={mAgenda} onChange={(e) => setMAgenda(e.target.value)} style={{ minHeight: 100, padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <BusyButton type="button" busy={formBusy} busyLabel="Scheduling…" onClick={addMeeting} style={{ marginTop: 20, background: "#818cf8", borderColor: "#818cf8", color: "white", fontWeight: 600, width: "100%" }}>Schedule Meeting</BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={editEventOpen} shown={editEventShown} onBackdrop={() => closeModal(setEditEventOpen, setEditEventShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#f472b6" }}><i className="fa-solid fa-pen"></i> Edit Event</h3>
                        <span className="close-btn" onClick={() => closeModal(setEditEventOpen, setEditEventShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <Field id="editEvAuthor" label="Organizer Name"><input type="text" id="editEvAuthor" placeholder="e.g. Alice" value={editEvAuthor} onChange={(e) => setEditEvAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="editEvTitle" label="Event Name" style={{ marginTop: 14 }}><input type="text" id="editEvTitle" placeholder="e.g. Q3 All Hands Sync" value={editEvTitle} onChange={(e) => setEditEvTitle(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="editEvDate" label="Event Date" style={{ marginTop: 14 }}><input type="date" id="editEvDate" value={editEvDate} onChange={(e) => setEditEvDate(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="editEvLoc" label="Location / Virtual Link" style={{ marginTop: 14 }}><input type="text" id="editEvLoc" placeholder="e.g. Google Meet URL or conference room name" value={editEvLoc} onChange={(e) => setEditEvLoc(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <BusyButton type="button" busy={formBusy} busyLabel="Saving…" onClick={saveEditEvent} style={{ marginTop: 20, background: "#f472b6", borderColor: "#f472b6", color: "white", fontWeight: 600, width: "100%" }}>Save Changes</BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={editMeetingOpen} shown={editMeetingShown} onBackdrop={() => closeModal(setEditMeetingOpen, setEditMeetingShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: "#818cf8" }}><i className="fa-solid fa-pen"></i> Edit Meeting</h3>
                        <span className="close-btn" onClick={() => closeModal(setEditMeetingOpen, setEditMeetingShown)}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <Field id="editMAuthor" label="Your Name"><input type="text" id="editMAuthor" placeholder="e.g. Alice" value={editMAuthor} onChange={(e) => setEditMAuthor(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="editMTime" label="Date & Time" style={{ marginTop: 14 }}><input type="datetime-local" id="editMTime" value={editMTime} onChange={(e) => setEditMTime(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="editMLink" label="Meeting URL" style={{ marginTop: 14 }}><input type="url" id="editMLink" placeholder="e.g. https://meet.google.com/abc-defg-hij" value={editMLink} onChange={(e) => setEditMLink(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <Field id="editMAgenda" label="Meeting Agenda" style={{ marginTop: 14 }}><textarea id="editMAgenda" placeholder="Specify key topics and goals..." value={editMAgenda} onChange={(e) => setEditMAgenda(e.target.value)} style={{ minHeight: 100, padding: "8px 12px", fontSize: "0.85rem" }} /></Field>
                        <BusyButton type="button" busy={formBusy} busyLabel="Saving…" onClick={saveEditMeeting} style={{ marginTop: 20, background: "#818cf8", borderColor: "#818cf8", color: "white", fontWeight: 600, width: "100%" }}>Save Changes</BusyButton>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={docsOpen} shown={docsShown} onBackdrop={() => closeModal(setDocsOpen, setDocsShown, () => { setViewingDocs(null); resetDocForm(); })}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", color: viewingDocs?.kind === "meeting" ? "#818cf8" : "#f472b6" }}>
                            <i className="fa-solid fa-file-lines"></i> Documents
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setDocsOpen, setDocsShown, () => { setViewingDocs(null); resetDocForm(); })}>&times;</span>
                    </div>
                    <div className="modal-body">
                        <p className="docs-subtitle">{docsRecord ? recordTitle({ ...docsRecord, kind: viewingDocs?.kind }) : ""}</p>
                        <div className="docs-list">
                            {!docsRecord ? (
                                <div className="docs-empty">This record is no longer available.</div>
                            ) : docsList.length === 0 ? (
                                <div className="docs-empty">No documents posted yet. Attach a file or paste a link below.</div>
                            ) : docsList.map((doc) => {
                                const payload = docPayloads.find((p) => sameId(p.id, doc.id));
                                const href = payload && payload.dataUrl ? "" : safeDocHref(doc.url);
                                const canDelete = canManageDocument(docsRecord, doc, actor?.name);
                                return (
                                    <div key={doc.id} className={`doc-row ${viewingDocs?.kind || ""}`}>
                                        <div className="doc-row-icon"><i className={docIconForName(doc.name || doc.url || "")}></i></div>
                                        <div className="doc-row-body">
                                            {href ? (
                                                <a href={href} target="_blank" rel="noopener noreferrer">{doc.name || "Untitled"}</a>
                                            ) : (
                                                <a href="#" onClick={(e) => { e.preventDefault(); openPostedDocument(doc); }}>{doc.name || "Untitled"}</a>
                                            )}
                                            <span>{formatDocMeta(doc)}</span>
                                        </div>
                                        {canDelete ? (
                                            <button type="button" className="doc-row-del" title="Remove" onClick={() => deleteRecordDocument(doc.id)}>
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="docs-post">
                            <div className="docs-post-label">Post a document</div>
                            <label
                                className={`docs-drop${viewingDocs?.kind === "meeting" ? " meeting" : ""}${docDropOver ? " dragover" : ""}`}
                                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDocDropOver(true); }}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDocDropOver(true); }}
                                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDocDropOver(false); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDocDropOver(false);
                                    const file = e.dataTransfer.files && e.dataTransfer.files[0];
                                    if (!file || !docFileRef.current) return;
                                    const transfer = new DataTransfer();
                                    transfer.items.add(file);
                                    docFileRef.current.files = transfer.files;
                                    onDocFileChosen(file);
                                }}
                            >
                                <input type="file" ref={docFileRef} onChange={(e) => onDocFileChosen(e.target.files && e.target.files[0])} />
                                <i className="fa-solid fa-cloud-arrow-up"></i>
                                <span>{docFileLabel}</span>
                            </label>
                            <input type="text" placeholder="Document name" value={docName} onChange={(e) => setDocName(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />
                            <input type="url" placeholder="Or paste a Drive / Dropbox / file URL" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} style={{ padding: "8px 12px", fontSize: "0.85rem" }} />
                            <button
                                type="button"
                                disabled={postingDoc}
                                onClick={postRecordDocument}
                                style={{ background: viewingDocs?.kind === "meeting" ? "#818cf8" : "#f472b6", borderColor: viewingDocs?.kind === "meeting" ? "#818cf8" : "#f472b6", color: "white" }}
                            >
                                {postingDoc ? <><i className="fa-solid fa-arrows-rotate fa-spin"></i> Posting...</> : <><i className="fa-solid fa-paper-plane"></i> Post document</>}
                            </button>
                        </div>
                    </div>
                </div>
            </ModuleModal>

            <ModuleModal open={infoOpen} shown={infoShown} onBackdrop={() => closeModal(setInfoOpen, setInfoShown)}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h3 style={{ margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
                            <i className="fa-solid fa-circle-info" style={{ color: "#f472b6" }}></i> Calendar
                        </h3>
                        <span className="close-btn" onClick={() => closeModal(setInfoOpen, setInfoShown)}>&times;</span>
                    </div>
                    <div className="modal-body" style={{ fontSize: "0.93rem", lineHeight: 1.65, color: "#9ca3af" }}>
                        <div style={{ marginBottom: 20 }}>
                            <h4 style={{ color: "#f472b6", margin: "0 0 8px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-regular fa-calendar"></i> About this Module
                            </h4>
                            <p style={{ margin: 0 }}>
                                {isAdminView
                                    ? "Admin console for the shared month calendar. Review and approve events and meetings, including join links, agendas, and post-meeting minutes."
                                    : "A shared month calendar for company events and team meetings — schedule gatherings, join links, agendas, and post-meeting minutes in one place."}
                            </p>
                        </div>
                        <div>
                            <h4 style={{ color: "#f472b6", margin: "0 0 10px 0", fontSize: "1rem", display: "flex", alignItems: "center", gap: 7 }}>
                                <i className="fa-solid fa-list-check"></i> Key Actions
                            </h4>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#f472b6", marginTop: 3, flexShrink: 0 }}></i><span>Browse events and meetings on the monthly calendar.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#f472b6", marginTop: 3, flexShrink: 0 }}></i><span>Add dated events with a location or virtual link.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#818cf8", marginTop: 3, flexShrink: 0 }}></i><span>Schedule meetings with a time, join URL, agenda, and minutes.</span></li>
                                <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><i className="fa-solid fa-circle-check" style={{ color: "#f472b6", marginTop: 3, flexShrink: 0 }}></i><span>{isAdminView ? "Approve or reject pending events and meetings from a selected day." : "Click a day to review, edit, or delete your own entries."}</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </ModuleModal>
        </div>
    );
}
