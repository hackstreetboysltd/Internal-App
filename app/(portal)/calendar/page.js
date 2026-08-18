import dynamic from "next/dynamic";
import CalendarFallback from "./CalendarFallback";
import "./calendar.css";

const CalendarClient = dynamic(() => import("./CalendarClient"), {
    loading: () => <CalendarFallback />,
});

export default function CalendarPage() {
    return <CalendarClient />;
}
