'use client';

import { useRouter, usePathname } from "next/navigation";
import { MODULES, moduleKeyFromPath, pathForModule, displayNameForModule } from "@/lib/modules";
import { saveActiveModule } from "@/lib/session";
import { useSession } from "@/lib/session";

export default function Dock() {
    const router = useRouter();
    const pathname = usePathname();
    const { isAdminView } = useSession();
    const activeKey = moduleKeyFromPath(pathname);

    const open = (mod) => {
        const name = displayNameForModule(mod.key, isAdminView);
        saveActiveModule(mod.key, name, isAdminView);
        router.push(pathForModule(mod.key, isAdminView));
    };

    return (
        <nav className="dock-container">
            <div className="dynamic-island" id="dynamicIsland">
                {MODULES.map((mod) => {
                    const isMessages = mod.key === "messages";
                    const selected = activeKey === mod.key;
                    const icon = isMessages && isAdminView ? "fa-solid fa-user-lock" : mod.icon;
                    const label = isMessages && isAdminView ? "Role Access" : mod.dockLabel;
                    const title = isMessages && isAdminView ? "Role Access Control" : mod.dockTitle;
                    return (
                        <button
                            key={mod.key}
                            id={isMessages ? "dockMessagesBtn" : undefined}
                            className={selected ? "dock-item selected" : "dock-item"}
                            type="button"
                            title={title}
                            onClick={() => open(mod)}
                        >
                            <i className={icon}></i>
                            <span className="dock-label">{label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
