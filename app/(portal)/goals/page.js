import dynamic from "next/dynamic";
import { Suspense } from "react";
import GoalsFallback from "./GoalsFallback";
import "./goals.css";

const GoalsClient = dynamic(() => import("./GoalsClient"), {
    loading: () => <GoalsFallback />,
});

export default function GoalsPage() {
    return (
        <Suspense fallback={<GoalsFallback />}>
            <GoalsClient />
        </Suspense>
    );
}
