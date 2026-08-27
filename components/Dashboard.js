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

const CHANNEL_BRIEF = [
    {
        key: "mission",
        label: "Mission",
        body: "We remove the barriers to software success, becoming the simplest channel every piece of software passes through on its way to success, now and for generations to come.",
    },
    {
        key: "vision",
        label: "Vision",
        body: "A world where every software, regardless of budget or reach, finds the people who need it with little to no hassle.",
    },
    {
        key: "goal",
        label: "Goal",
        body: "Position ourselves at the center of that flow as the default channel where software easily meets its needs, making it easier to monetize and we earn our share of the value we help create.",
    },
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
            <section className="channel-brief" aria-label="Company direction">
                <p className="channel-brief-kicker">The channel</p>
                <ol className="channel-brief-flow">
                    {CHANNEL_BRIEF.map((item, index) => (
                        <li
                            key={item.key}
                            className="channel-brief-node"
                            style={{ "--node-i": index }}
                        >
                            <span className="channel-brief-dot" aria-hidden="true" />
                            <h2 className="channel-brief-label">{item.label}</h2>
                            <p className="channel-brief-body">{item.body}</p>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    );
}
