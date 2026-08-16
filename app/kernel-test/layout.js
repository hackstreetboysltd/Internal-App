'use client';

import { SessionProvider } from "@/lib/session";

export default function KernelTestLayout({ children }) {
  return <SessionProvider requireAuth>{children}</SessionProvider>;
}
