export default function CalendarFallback() {
    return (
        <div className="calendar-module" aria-busy="true" aria-label="Loading calendar">
            <div className="cal-nav">
                <div className="cal-nav-btn" style={{ opacity: 0.3 }}></div>
                <div className="skel-line w40" style={{ height: 22, width: 160, margin: "0 auto" }}></div>
                <div className="cal-nav-btn" style={{ opacity: 0.3 }}></div>
            </div>
            <div className="cal-skeleton">
                {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="skel-day"></div>
                ))}
            </div>
        </div>
    );
}
