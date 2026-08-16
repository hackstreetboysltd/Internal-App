'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    { key: "apps", title: "Apps", iconWrap: "apps-color", icon: "fa-solid fa-layer-group" },
    { key: "messages", title: "Messages", iconWrap: "messages-color", icon: "fa-solid fa-comments", cardId: "dashMessagesCard" },
    { key: "calendar", title: "Calendar", iconWrap: "calendar-color", icon: "fa-regular fa-calendar" },
    { key: "goals", title: "Goals", iconWrap: "goals-color", icon: "fa-solid fa-bullseye" },
    { key: "skills", title: "Skills", iconWrap: "skills-color", icon: "fa-solid fa-brain" },
    { key: "procedures", title: "Procedures", iconWrap: "procedures-color", icon: "fa-solid fa-list-check" },
];

export default function Dashboard() {
    const router = useRouter();
    const { isAdminView } = useSession();
    const [greeting, setGreeting] = useState("Welcome Back, Team");

    useEffect(() => {
        const t = setTimeout(() => setGreeting(greetingText()), 0);
        return () => clearTimeout(t);
    }, []);

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
                    return (
                        <div
                            key={card.key}
                            className="dash-card"
                            id={card.cardId}
                            onClick={() => open(card.key)}
                        >
                            <div className={`card-icon ${iconWrap}`}><i className={icon}></i></div>
                            <div className="card-info">
                                <span className="card-title">{title}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
