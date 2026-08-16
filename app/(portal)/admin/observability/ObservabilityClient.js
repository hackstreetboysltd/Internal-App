'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGlobalDialog } from "@/components/GlobalDialog";
import { emailIsListedAdmin, sessionHasAdminRole } from "@/lib/adminAccess";
import { apiPath } from "@/lib/apiPath";
import { get } from "@/lib/portalApi";
import { formatPortalTime, useServerClock } from "@/lib/portalTime";
import { useSession } from "@/lib/session";
import "./observability.css";

const MAX_ROWS = 1000;
const HISTORY_PAGE = 50;

function statusClass(status) {
  if (status === 429) return "status-429";
  if (status >= 500) return "status-5xx";
  if (status >= 400) return "status-4xx";
  return "status-2xx";
}

/**
 * @param {Record<string, unknown>} row
 * @param {ReturnType<typeof defaultFilters>} filters
 */
function matchesApiFilters(row, filters) {
  if (filters.method && row.method !== filters.method) return false;
  if (filters.pathPrefix && !String(row.path || "").startsWith(filters.pathPrefix)) return false;
  if (filters.status && Number(row.status) !== Number(filters.status)) return false;
  if (filters.email && !String(row.email || "").toLowerCase().includes(filters.email.toLowerCase())) return false;
  if (filters.errorsOnly && Number(row.status) < 400) return false;
  if (filters.rateLimitedOnly && !row.rateLimited) return false;
  return true;
}

function computeLiveStats(rows, now) {
  const inWindow = (ms) => rows.filter((row) => {
    const t = new Date(row.timestamp).getTime();
    return Number.isFinite(t) && now - t >= 0 && now - t <= ms;
  });
  const oneMin = inWindow(60000);
  const fiveMin = inWindow(5 * 60000);
  const hour = inWindow(60 * 60000);
  const errors = fiveMin.filter((row) => Number(row.status) >= 400);
  const rateLimited = fiveMin.filter((row) => row.rateLimited);
  const pathCounts = new Map();
  for (const row of hour) {
    const path = String(row.path || "");
    pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
  }
  const topPaths = [...pathCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }));

  return {
    rps: Math.round((oneMin.length / 60) * 100) / 100,
    totalRequests: fiveMin.length,
    errorRate: fiveMin.length > 0 ? Math.round((errors.length / fiveMin.length) * 1000) / 10 : 0,
    rateLimitedCount: rateLimited.length,
    topPaths: topPaths,
  };
}

function defaultFilters() {
  return {
    method: "",
    pathPrefix: "",
    status: "",
    email: "",
    errorsOnly: false,
    rateLimitedOnly: false,
  };
}

async function fetchJson(path) {
  const res = await fetch(apiPath(path), { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}`);
  }
  return res.json();
}

export default function ObservabilityClient() {
  const { session, ready, refreshSession } = useSession();
  const { showGlobalDialog } = useGlobalDialog();
  const roleAdmin = sessionHasAdminRole(session);
  const [listedAdmin, setListedAdmin] = useState(false);
  const [gateReady, setGateReady] = useState(roleAdmin);
  const isAdmin = roleAdmin || listedAdmin;

  const [paused, setPaused] = useState(false);
  const [feedMode, setFeedMode] = useState("live");
  const [filters, setFilters] = useState(defaultFilters);
  const [apiRows, setApiRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const { nowMs, source: clockSource, timeZone } = useServerClock();
  const [selected, setSelected] = useState(null);
  const [trace, setTrace] = useState({ requests: [], activity: [] });
  const [traceLoading, setTraceLoading] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyDone, setHistoryDone] = useState(false);
  const [userSessions, setUserSessions] = useState([]);

  const pausedRef = useRef(paused);
  const filtersRef = useRef(filters);

  useEffect(() => {
    pausedRef.current = paused;
    filtersRef.current = filters;
  }, [paused, filters]);

  const stats = useMemo(() => computeLiveStats(apiRows, nowMs), [apiRows, nowMs]);

  const prependCap = useCallback((setter, row, keyFn) => {
    setter((prev) => {
      const key = keyFn(row);
      const without = prev.filter((item) => keyFn(item) !== key);
      return [row, ...without].slice(0, MAX_ROWS);
    });
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    if (roleAdmin) {
      setListedAdmin(false);
      setGateReady(true);
      return undefined;
    }
    if (!session?.email) {
      setListedAdmin(false);
      setGateReady(true);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const next = await refreshSession();
        if (cancelled) return;
        if (sessionHasAdminRole(next)) {
          setListedAdmin(false);
          setGateReady(true);
          return;
        }
        const data = await get("role_access", { admin: false });
        const adminsRecord = Array.isArray(data) ? data.find((row) => row.id === "admins") : null;
        const listed = emailIsListedAdmin(session.email, adminsRecord?.emails);
        if (!cancelled) {
          setListedAdmin(listed);
          setGateReady(true);
        }
      } catch {
        if (!cancelled) {
          setListedAdmin(false);
          setGateReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ready, roleAdmin, refreshSession, session?.email]);

  useEffect(() => {
    if (!isAdmin || paused || feedMode !== "live") return;

    const requestsUrl = apiPath("/api/admin/stream/requests");
    const activityUrl = apiPath("/api/admin/stream/activity");
    const reqSource = new EventSource(requestsUrl);
    const actSource = new EventSource(activityUrl);

    reqSource.onmessage = (event) => {
      if (pausedRef.current) return;
      try {
        const row = JSON.parse(event.data);
        if (row.error) return;
        if (!matchesApiFilters(row, filtersRef.current)) return;
        prependCap(setApiRows, row, (r) => r.requestId || `${r.timestamp}-${r.path}`);
      } catch {
        /* ignore */
      }
    };

    actSource.onmessage = (event) => {
      if (pausedRef.current) return;
      try {
        const row = JSON.parse(event.data);
        if (row.error) return;
        prependCap(setActivityRows, row, (r) => r.id || `${r.timestamp}-${r.eventType}`);
      } catch {
        /* ignore */
      }
    };

    return () => {
      reqSource.close();
      actSource.close();
    };
  }, [isAdmin, paused, feedMode, prependCap]);

  const historyQuery = useCallback((offset) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(HISTORY_PAGE));
    qs.set("offset", String(offset));
    if (filters.method) qs.set("method", filters.method);
    if (filters.pathPrefix) qs.set("pathPrefix", filters.pathPrefix);
    if (filters.status) qs.set("status", filters.status);
    if (filters.email) qs.set("email", filters.email);
    if (filters.errorsOnly) qs.set("errorsOnly", "1");
    if (filters.rateLimitedOnly) qs.set("rateLimitedOnly", "1");
    return qs.toString();
  }, [filters]);

  const loadHistory = useCallback(async (reset) => {
    const offset = reset ? 0 : historyOffset;
    const qs = historyQuery(offset);
    const [reqData, actData] = await Promise.all([
      fetchJson(`/api/admin/requests?${qs}`),
      fetchJson(`/api/admin/activity?${qs}`),
    ]);
    const nextReq = reqData.rows || [];
    const nextAct = actData.rows || [];
    if (reset) {
      setApiRows(nextReq);
      setActivityRows(nextAct);
    } else {
      setApiRows((prev) => [...prev, ...nextReq].slice(0, MAX_ROWS));
      setActivityRows((prev) => [...prev, ...nextAct].slice(0, MAX_ROWS));
    }
    setHistoryOffset(offset + HISTORY_PAGE);
    setHistoryDone(nextReq.length < HISTORY_PAGE && nextAct.length < HISTORY_PAGE);
  }, [historyOffset, historyQuery]);

  useEffect(() => {
    if (!isAdmin || feedMode !== "history") return;
    const t = setTimeout(() => {
      loadHistory(true).catch((err) => console.warn("History load failed:", err));
    }, 0);
    return () => clearTimeout(t);
    // Intentionally load when mode/filters change, not on every offset bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, feedMode, filters.method, filters.pathPrefix, filters.status, filters.email, filters.errorsOnly, filters.rateLimitedOnly]);

  useEffect(() => {
    const email = selected?.row?.email;
    if (!email) return undefined;
    let cancelled = false;
    fetchJson(`/api/admin/sessions/?email=${encodeURIComponent(email)}`)
      .then((data) => {
        if (!cancelled) setUserSessions(data.rows || []);
      })
      .catch(() => {
        if (!cancelled) setUserSessions([]);
      });
    return () => { cancelled = true; };
  }, [selected]);

  const loadTrace = useCallback(async (sessionId) => {
    if (!sessionId) {
      setTrace({ requests: [], activity: [] });
      return;
    }
    setTraceLoading(true);
    try {
      const [reqData, actData] = await Promise.all([
        fetchJson(`/api/admin/requests?sessionId=${encodeURIComponent(sessionId)}&limit=100`),
        fetchJson(`/api/admin/activity?sessionId=${encodeURIComponent(sessionId)}&limit=100`),
      ]);
      setTrace({
        requests: reqData.rows || [],
        activity: actData.rows || [],
      });
    } catch (err) {
      console.warn("Trace load failed:", err);
      setTrace({ requests: [], activity: [] });
    } finally {
      setTraceLoading(false);
    }
  }, []);

  const onSelectApiRow = useCallback((row) => {
    setSelected({ kind: "api", row });
    loadTrace(row.sessionId);
  }, [loadTrace]);

  const onSelectActivityRow = useCallback((row) => {
    setSelected({ kind: "activity", row });
    loadTrace(row.sessionId);
  }, [loadTrace]);

  const killSession = useCallback(async (sid) => {
    const confirmed = await showGlobalDialog({
      title: "Force logout",
      message: `Destroy Redis session ${sid}? The user will need to sign in again.`,
      type: "warning",
      confirmText: "Kill session",
      showCancel: true,
    });
    if (!confirmed) return;
    const res = await fetch(apiPath(`/api/admin/sessions/${sid}/`), {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      await showGlobalDialog({
        title: "Kill failed",
        message: `Could not destroy session (${res.status}).`,
        type: "error",
      });
      return;
    }
    setUserSessions((prev) => prev.filter((s) => s.sid !== sid));
  }, [showGlobalDialog]);

  const combinedTrace = useMemo(() => {
    const items = [
      ...trace.requests.map((r) => ({ ...r, kind: "api", sortTs: r.timestamp })),
      ...trace.activity.map((a) => ({ ...a, kind: "activity", sortTs: a.timestamp })),
    ];
    return items.sort((a, b) => new Date(b.sortTs) - new Date(a.sortTs));
  }, [trace]);

  if (!ready || !gateReady) {
    return <div className="obs-empty">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="obs-denied">
        <div><i className="fa-solid fa-lock"></i></div>
        <p>Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="observability-module">
      <div className="obs-header">
        <h2><i className="fa-solid fa-chart-line"></i> Observability</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="obs-clock" title={`Source: ${clockSource}`}>
            <span className="obs-clock-time" suppressHydrationWarning>
              {nowMs ? formatPortalTime(nowMs, { withMs: false }) : "\u00a0"}
            </span>
            <span className="obs-clock-tz">{timeZone.replace("_", " ")}</span>
          </div>
          <button
            type="button"
            className={`obs-btn${feedMode === "live" ? " active" : ""}`}
            onClick={() => setFeedMode("live")}
          >
            Live
          </button>
          <button
            type="button"
            className={`obs-btn${feedMode === "history" ? " active" : ""}`}
            onClick={() => setFeedMode("history")}
          >
            History
          </button>
          {feedMode === "live" ? (
            <>
              <span className={`obs-live-dot${paused ? " paused" : ""}`} title={paused ? "Paused" : "Live"}></span>
              <button
                type="button"
                className={`obs-btn${paused ? " paused" : " active"}`}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "Resume live feed" : "Pause live feed"}
              </button>
            </>
          ) : null}
        </div>
      </div>

          <div className="obs-stats">
            <div className="obs-stat-card">
              <div className="label">RPS (1m)</div>
              <div className="value">{stats.rps}</div>
            </div>
            <div className="obs-stat-card">
              <div className="label">Requests (5m)</div>
              <div className="value">{stats.totalRequests}</div>
            </div>
            <div className="obs-stat-card">
              <div className="label">Error rate</div>
              <div className="value">{stats.errorRate}%</div>
            </div>
            <div className="obs-stat-card">
              <div className="label">Rate limited</div>
              <div className="value">{stats.rateLimitedCount}</div>
            </div>
          </div>
          {stats.topPaths.length ? (
            <div className="obs-top-paths">
              <h4>Top paths (1h, live)</h4>
              <ul>
                {stats.topPaths.map((item) => (
                  <li key={item.path}>
                    <span className="obs-mono obs-truncate">{item.path}</span>
                    <span>{item.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

      <div className="obs-toolbar">
        <select
          value={filters.method}
          onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}
        >
          <option value="">All methods</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          placeholder="Path prefix"
          value={filters.pathPrefix}
          onChange={(e) => setFilters((f) => ({ ...f, pathPrefix: e.target.value }))}
        />
        <input
          placeholder="Status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        />
        <input
          placeholder="User email"
          value={filters.email}
          onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
        />
        <label>
          <input
            type="checkbox"
            checked={filters.errorsOnly}
            onChange={(e) => setFilters((f) => ({ ...f, errorsOnly: e.target.checked }))}
          />
          Errors only
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.rateLimitedOnly}
            onChange={(e) => setFilters((f) => ({ ...f, rateLimitedOnly: e.target.checked }))}
          />
          Rate limited
        </label>
        <button type="button" className="obs-btn" onClick={() => { setApiRows([]); setActivityRows([]); }}>
          Clear tables
        </button>
      </div>

      <div className="obs-panels">
        <section className="obs-panel">
          <div className="obs-panel-head">
            <h3>{feedMode === "live" ? "Live API requests" : "Historical API requests"}</h3>
            <span className="count">{apiRows.length} rows</span>
          </div>
          <div className="obs-table-wrap">
            {apiRows.length === 0 ? (
              <div className="obs-empty">Waiting for API traffic…</div>
            ) : (
              <table className="obs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th>Status</th>
                    <th>ms</th>
                  </tr>
                </thead>
                <tbody>
                  {apiRows.map((row) => (
                    <tr
                      key={row.requestId || row.timestamp}
                      className={selected?.kind === "api" && selected.row.requestId === row.requestId ? "selected" : ""}
                      onClick={() => onSelectApiRow(row)}
                    >
                      <td>{formatPortalTime(row.timestamp)}</td>
                      <td className="obs-truncate">{row.email || "—"}</td>
                      <td className="obs-mono">{row.method}</td>
                      <td className="obs-mono obs-truncate">{row.path}</td>
                      <td className={statusClass(Number(row.status))}>{row.status}</td>
                      <td>{row.durationMs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="obs-panel">
          <div className="obs-panel-head">
            <h3>{feedMode === "live" ? "Live activity" : "Historical activity"}</h3>
            <span className="count">{activityRows.length} rows</span>
          </div>
          <div className="obs-table-wrap">
            {activityRows.length === 0 ? (
              <div className="obs-empty">Waiting for activity events…</div>
            ) : (
              <table className="obs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Event</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((row) => (
                    <tr
                      key={row.id || `${row.timestamp}-${row.eventType}`}
                      className={selected?.kind === "activity" && selected.row.id === row.id ? "selected" : ""}
                      onClick={() => onSelectActivityRow(row)}
                    >
                      <td>{formatPortalTime(row.timestamp)}</td>
                      <td className="obs-truncate">{row.email || "—"}</td>
                      <td className="obs-mono">{row.eventType}</td>
                      <td className="obs-truncate">{row.path || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {feedMode === "history" && !historyDone ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="obs-btn"
            onClick={() => loadHistory(false).catch((err) => console.warn("History page failed:", err))}
          >
            Load more
          </button>
        </div>
      ) : null}

      {selected ? (
        <div className="obs-drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="obs-drawer" onClick={(e) => e.stopPropagation()}>
            <h3>{selected.kind === "api" ? "API request detail" : "Activity detail"}</h3>
            <dl>
              <dt>Time</dt>
              <dd>{formatPortalTime(selected.row.timestamp)}</dd>
              <dt>User</dt>
              <dd>{selected.row.email || "—"}</dd>
              <dt>Session</dt>
              <dd>{selected.row.sessionId || "—"}</dd>
              {selected.kind === "api" ? (
                <>
                  <dt>Request ID</dt>
                  <dd>{selected.row.requestId}</dd>
                  <dt>Method</dt>
                  <dd>{selected.row.method}</dd>
                  <dt>Path</dt>
                  <dd>{selected.row.path}</dd>
                  <dt>Status</dt>
                  <dd className={statusClass(Number(selected.row.status))}>{selected.row.status}</dd>
                  <dt>Duration</dt>
                  <dd>{selected.row.durationMs} ms</dd>
                  <dt>Rate limited</dt>
                  <dd>{selected.row.rateLimited ? "Yes" : "No"}</dd>
                </>
              ) : (
                <>
                  <dt>Event</dt>
                  <dd>{selected.row.eventType}</dd>
                  <dt>Path</dt>
                  <dd>{selected.row.path || "—"}</dd>
                </>
              )}
            </dl>

            {selected.kind === "api" && selected.row.query ? (
              <>
                <h4 style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: 8 }}>Query params</h4>
                <pre>{JSON.stringify(selected.row.query, null, 2)}</pre>
              </>
            ) : null}

            {selected.kind === "activity" && selected.row.meta ? (
              <>
                <h4 style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: 8 }}>Meta</h4>
                <pre>{JSON.stringify(selected.row.meta, null, 2)}</pre>
              </>
            ) : null}

            <h4 style={{ color: "#9ca3af", fontSize: "0.85rem", margin: "16px 0 8px" }}>
              Redis sessions ({selected?.row?.email ? userSessions.length : 0})
            </h4>
            {!selected?.row?.email || userSessions.length === 0 ? (
              <p className="obs-empty" style={{ padding: "8px 0" }}>No live Redis sessions for this email.</p>
            ) : (
              <ul className="obs-trace-list">
                {userSessions.map((s) => (
                  <li key={s.sid}>
                    <div className="obs-mono" style={{ color: "#a5b4fc" }}>{s.sid}</div>
                    <div style={{ color: "#9ca3af", marginTop: 2 }}>
                      last seen {formatPortalTime(s.lastSeenAt)} · tab {s.sessionId || "—"}
                    </div>
                    <button
                      type="button"
                      className="obs-btn paused"
                      style={{ marginTop: 8 }}
                      onClick={() => killSession(s.sid)}
                    >
                      Force logout
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h4 style={{ color: "#9ca3af", fontSize: "0.85rem", margin: "16px 0 8px" }}>
              Session trace {traceLoading ? "(loading…)" : `(${combinedTrace.length})`}
            </h4>
            {combinedTrace.length === 0 ? (
              <p className="obs-empty" style={{ padding: "12px 0" }}>No linked events for this session.</p>
            ) : (
              <ul className="obs-trace-list">
                {combinedTrace.map((item) => (
                  <li key={`${item.kind}-${item.requestId || item.id || item.sortTs}`}>
                    <div className="obs-mono" style={{ color: "#a5b4fc" }}>
                      {formatPortalTime(item.sortTs)} · {item.kind === "api" ? `${item.method} ${item.path}` : item.eventType}
                    </div>
                    <div style={{ color: "#9ca3af", marginTop: 2 }}>
                      {item.kind === "api" ? `status ${item.status}` : (item.path || "")}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" className="obs-btn" style={{ marginTop: 20 }} onClick={() => setSelected(null)}>
              Close
            </button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
