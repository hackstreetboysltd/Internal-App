export const MODULES = [
    { key: "apps", path: "/apps/", name: "Apps Module", dockLabel: "Apps", dockTitle: "Apps Registry", icon: "fa-solid fa-layer-group", stubTitle: "Our Digital Suite" },
    { key: "goals", path: "/goals/", name: "Weekly Goals", dockLabel: "Goals", dockTitle: "Goals Planner", icon: "fa-solid fa-bullseye", stubTitle: "Weekly Goals" },
    { key: "skills", path: "/skills/", name: "Skills", dockLabel: "Skills", dockTitle: "Skills Repository", icon: "fa-solid fa-brain", stubTitle: "Skills" },
    { key: "messages", path: "/messages/", name: "Messages", dockLabel: "Messages", dockTitle: "Messages", icon: "fa-solid fa-comments", stubTitle: "Messages" },
    { key: "calendar", path: "/calendar/", name: "Calendar", dockLabel: "Calendar", dockTitle: "Calendar", icon: "fa-regular fa-calendar", stubTitle: "Calendar" },
    { key: "procedures", path: "/procedures/", name: "Procedures", dockLabel: "Guides", dockTitle: "Procedural Guides", icon: "fa-solid fa-list-check", stubTitle: "Procedures" },
    { key: "documents", path: "/documents/", name: "Documents", dockLabel: "Docs", dockTitle: "Documents", icon: "fa-solid fa-file-lines", stubTitle: "Documents" },
    { key: "profile", path: "/profile/", name: "Profile", dockLabel: "Profile", dockTitle: "User Profile", icon: "fa-regular fa-user", stubTitle: "Profiles" },
];

export function normalizeModuleKey(folderName) {
    if (folderName === "meetings") return "calendar";
    return folderName;
}

export function pathForModule(folderName, isAdmin) {
    const key = normalizeModuleKey(folderName);
    if (key === "messages" && isAdmin) return "/role-access/";
    const mod = MODULES.find((m) => m.key === key);
    return mod ? mod.path : `/${key}/`;
}

export function moduleKeyFromPath(pathname) {
    if (!pathname) return null;
    if (pathname === "/" || pathname === "") return null;
    if (pathname.startsWith("/apps")) return "apps";
    if (pathname.startsWith("/goals")) return "goals";
    if (pathname.startsWith("/skills")) return "skills";
    if (pathname.startsWith("/messages") || pathname.startsWith("/role-access")) return "messages";
    if (pathname.startsWith("/calendar")) return "calendar";
    if (pathname.startsWith("/procedures")) return "procedures";
    if (pathname.startsWith("/documents")) return "documents";
    if (pathname.startsWith("/profile")) return "profile";
    return null;
}

export function displayNameForModule(folderName, isAdmin) {
    const key = normalizeModuleKey(folderName);
    if (key === "messages" && isAdmin) return "Role Access";
    const mod = MODULES.find((m) => m.key === key);
    return mod ? mod.name : folderName;
}
