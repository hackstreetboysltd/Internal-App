'use client';

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { pathForModule, displayNameForModule } from "@/lib/modules";
import { saveActiveModule } from "@/lib/session";

const CARDS = [
    { key: "apps", title: "Apps", icon: "fa-solid fa-layer-group" },
    { key: "messages", title: "Messages", icon: "fa-solid fa-comments", cardId: "dashMessagesCard" },
    { key: "calendar", title: "Calendar", icon: "fa-regular fa-calendar" },
    { key: "goals", title: "Goals", icon: "fa-solid fa-bullseye" },
    { key: "skills", title: "Skills", icon: "fa-solid fa-brain" },
    { key: "procedures", title: "Procedures", icon: "fa-solid fa-list-check" },
    { key: "documents", title: "Documents", icon: "fa-solid fa-file-lines" },
];

export default function Dashboard() {
    const router = useRouter();
    const { isAdminView } = useSession();

    const open = (key) => {
        const name = displayNameForModule(key, isAdminView);
        saveActiveModule(key, name, isAdminView);
        router.push(pathForModule(key, isAdminView));
    };

    return (
        <div id="welcomeScreen" className="welcome-screen">
            <div className="dashboard-grid">
                {CARDS.map((card) => {
                    const isMessages = card.key === "messages";
                    const title = isMessages && isAdminView ? "Role Access" : card.title;
                    const icon = isMessages && isAdminView ? "fa-solid fa-user-lock" : card.icon;
                    const tone = isMessages && isAdminView ? "role-access" : card.key;
                    return (
                        <button
                            key={card.key}
                            type="button"
                            className="mod-tile"
                            id={card.cardId}
                            data-tone={tone}
                            onClick={() => open(card.key)}
                        >
                            <span className="mod-tile-icon" aria-hidden="true">
                                <i className={icon}></i>
                            </span>
                            <span className="mod-tile-name">{title}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
