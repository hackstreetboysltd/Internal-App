import dynamic from "next/dynamic";
import { Suspense } from "react";
import MessagesFallback from "./MessagesFallback";
import "./messages.css";

const MessagesClient = dynamic(() => import("./MessagesClient"), {
    loading: () => <MessagesFallback />,
});

export default function MessagesPage() {
    return (
        <Suspense fallback={<MessagesFallback />}>
            <MessagesClient />
        </Suspense>
    );
}
