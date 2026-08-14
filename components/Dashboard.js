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

export default function Dashboard() {
    const router = useRouter();
    const { isAdminView } = useSession();
    const [greeting, setGreeting] = useState("Welcome Back, Team");
    const [stats, setStats] = useState({});

    useEffect(() => {
        const t = setTimeout(() => setGreeting(greetingText()), 0);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const next = {};
            for (const card of CARDS) {
                try {
                    const data = await get(card.key);
                    if (card.key === "goals") {
                        next[card.key] = new Set((data || []).map((item) => item.user)).size;
                    } else if (card.key === "messages") {
                        if (isAdminView) {
                            try {
                                const raData = await get("role_access", { admin: false });
                                const allowedRec = Array.isArray(raData) ? raData.find((r) => r.id === "allowed") : null;
                                next[card.key] = allowedRec ? (allowedRec.emails || []).length : 0;
                            } catch {
                                next[card.key] = 0;
                            }
                        } else {
                            next[card.key] = Array.isArray(data) ? data.length : 0;
                        }
                    } else if (card.key === "calendar") {
                        let meetingCount = 0;
                        try {
                            const meetingData = await get("meetings");
                            meetingCount = Array.isArray(meetingData) ? meetingData.length : 0;
                        } catch {
                            meetingCount = 0;
                        }
                        next[card.key] = (Array.isArray(data) ? data.length : 0) + meetingCount;
                    } else {
                        next[card.key] = Array.isArray(data) ? data.length : 0;
                    }
                } catch (err) {
                    console.warn(`Failed fetching dashboard stats for ${card.key}:`, err);
                    next[card.key] = 0;
                }
            }
            if (!cancelled) setStats(next);
        })();
        return () => { cancelled = true; };
    }, [isAdminView]);

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
