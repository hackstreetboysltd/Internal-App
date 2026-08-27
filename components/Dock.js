'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MODULES, moduleKeyFromPath, pathForModule, displayNameForModule } from "@/lib/modules";
import { saveActiveModule } from "@/lib/session";
import { useSession } from "@/lib/session";

export default function Dock() {
    const router = useRouter();
    const pathname = usePathname();
    const { isAdminView } = useSession();
    const routeActiveKey = moduleKeyFromPath(pathname);
    const [pendingKey, setPendingKey] = useState(null);
    const activeKey = pendingKey && pendingKey !== routeActiveKey ? pendingKey : routeActiveKey;

    useEffect(() => {
        MODULES.forEach((mod) => {
            router.prefetch(pathForModule(mod.key, isAdminView));
        });
    }, [isAdminView, router]);

    const handleNav = (mod) => {
        const name = displayNameForModule(mod.key, isAdminView);
        saveActiveModule(mod.key, name, isAdminView);
        if (mod.key !== routeActiveKey) {
            setPendingKey(mod.key);
        }
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
                        <Link
                            key={mod.key}
                            href={pathForModule(mod.key, isAdminView)}
                            prefetch
                            id={isMessages ? "dockMessagesBtn" : undefined}
                            className={selected ? "dock-item selected" : "dock-item"}
                            title={title}
                            aria-current={selected ? "page" : undefined}
                            onClick={() => handleNav(mod)}
                        >
                            <i className={icon}></i>
                            <span className="dock-label">{label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
