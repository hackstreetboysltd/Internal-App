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
            <section className="dashboard-manifesto" aria-label="Company direction">
                <div className="dashboard-manifesto-block">
                    <h2>Mission</h2>
                    <p>
                        We remove the barriers to software success, becoming the simplest channel every piece of software
                        passes through on its way to success, now and for generations to come.
                    </p>
                </div>
                <div className="dashboard-manifesto-block">
                    <h2>Vision</h2>
                    <p>
                        A world where every software, regardless of budget or reach, finds the people who need it with
                        little to no hassle.
                    </p>
                </div>
                <div className="dashboard-manifesto-block">
                    <h2>Goal</h2>
                    <p>
                        Position ourselves at the center of that flow as the default channel where software easily meets
                        its needs, making it easier to monetize and we earn our share of the value we help create.
                    </p>
                </div>
            </section>
        </div>
    );
}
