'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { get } from "@/lib/portalApi";
import { useSession } from "@/lib/session";
import { pathForModule, displayNameForModule } from "@/lib/modules";
import { saveActiveModule } from "@/lib/session";

function greetingText() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon, Team";
    return "Good Evening";
}

const CARDS = [
    { key: "apps", id: "statApps", title: "Apps", iconWrap: "apps-color", icon: "fa-solid fa-layer-group" },
    { key: "messages", id: "statMessages", title: "Messages", iconWrap: "messages-color", icon: "fa-solid fa-comments", cardId: "dashMessagesCard" },
    { key: "calendar", id: "statCalendar", title: "Calendar", iconWrap: "calendar-color", icon: "fa-regular fa-calendar" },
    { key: "goals", id: "statGoals", title: "Goals", iconWrap: "goals-color", icon: "fa-solid fa-bullseye" },
    { key: "skills", id: "statSkills", title: "Skills", iconWrap: "skills-color", icon: "fa-solid fa-brain" },
    { key: "procedures", id: "statProcedures", title: "Procedures", iconWrap: "procedures-color", icon: "fa-solid fa-list-check" },
];

async function statForCard(card, isAdminView) {
    const opts = { admin: false };
    try {
        if (card.key === "messages" && isAdminView) {
            const raData = await get("role_access", opts);
            const allowedRec = Array.isArray(raData) ? raData.find((r) => r.id === "allowed") : null;
            return allowedRec ? (allowedRec.emails || []).length : 0;
        }
        if (card.key === "calendar") {
            const [data, meetingData] = await Promise.all([
                get(card.key, opts),
                get("meetings", opts),
            ]);
            const calCount = Array.isArray(data) ? data.length : 0;
            const meetingCount = Array.isArray(meetingData) ? meetingData.length : 0;
            return calCount + meetingCount;
        }
        if (card.key === "goals") {
            const data = await get(card.key, opts);
            return new Set((data || []).map((item) => item.user)).size;
        }
        const data = await get(card.key, opts);
        return Array.isArray(data) ? data.length : 0;
    } catch (err) {
        console.warn(`Failed fetching dashboard stats for ${card.key}:`, err);
        return 0;
    }
}

export default function Dashboard() {
    const router = useRouter();
    const { isAdminView, ready, session } = useSession();
    const [greeting, setGreeting] = useState("Welcome Back, Team");
    const [stats, setStats] = useState({});

    useEffect(() => {
        const t = setTimeout(() => setGreeting(greetingText()), 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (!ready || !session) return;
        let cancelled = false;
        (async () => {
            const entries = await Promise.all(
                CARDS.map(async (card) => [card.key, await statForCard(card, isAdminView)]),
            );
            if (!cancelled) setStats(Object.fromEntries(entries));
        })();
        return () => { cancelled = true; };
    }, [isAdminView, ready, session]);

    const open = (key) => {
        const name = displayNameForModule(key, isAdminView);
        saveActiveModule(key, name, isAdminView);
        router.push(pathForModule(key, isAdminView));
    };

    return (
        <div id="welcomeScreen" className="welcome-screen">
            <div className="welcome-header">
                <h1 id="greeting">{greeting}</h1>
            </div>
            <div className="dashboard-grid">
                {CARDS.map((card) => {
                    const isMessages = card.key === "messages";
                    const title = isMessages && isAdminView ? "Role Access" : card.title;
                    const iconWrap = isMessages && isAdminView ? "role-access-color" : card.iconWrap;
                    const icon = isMessages && isAdminView ? "fa-solid fa-user-lock" : card.icon;
                    const value = stats[card.key];
                    return (
                        <div
                            key={card.key}
                            className="dash-card"
                            id={card.cardId}
                            onClick={() => open(card.key)}
                        >
                            <div className={`card-icon ${iconWrap}`}><i className={icon}></i></div>
                            <div className="card-info">
                                <span className="card-value" id={card.id}>{value == null ? "-" : value}</span>
                                <span className="card-title">{title}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
