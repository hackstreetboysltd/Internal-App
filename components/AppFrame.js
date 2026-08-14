'use client';

import { usePathname } from "next/navigation";
import PortalShell from "@/components/PortalShell";

export default function AppFrame({ children }) {
    const pathname = usePathname();
    const bare = pathname.startsWith("/login")
        || pathname.startsWith("/github-connect")
        || pathname.startsWith("/kernel-test");
    if (bare) return children;
    return <PortalShell>{children}</PortalShell>;
}
