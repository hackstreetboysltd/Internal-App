/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("activity_logs", {
    id: { type: "bigserial", primaryKey: true },
    uid: { type: "uuid", references: "users", onDelete: "set null" },
    email: { type: "text", notNull: true },
    session_id: { type: "text" },
    event_type: { type: "text", notNull: true },
    path: { type: "text" },
    meta: { type: "jsonb", notNull: true, default: "{}" },
    ip: { type: "inet" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.sql("CREATE INDEX idx_activity_created ON activity_logs (created_at DESC)");
  pgm.sql("CREATE INDEX idx_activity_uid ON activity_logs (uid, created_at DESC)");
  pgm.sql("CREATE INDEX idx_activity_session ON activity_logs (session_id, created_at)");

  pgm.createTable("api_request_logs", {
    id: { type: "bigserial", primaryKey: true },
    request_id: { type: "uuid", notNull: true },
    method: { type: "text", notNull: true },
    path: { type: "text", notNull: true },
    query: { type: "jsonb", default: "{}" },
    status: { type: "smallint", notNull: true },
    duration_ms: { type: "integer", notNull: true },
    uid: { type: "uuid", references: "users", onDelete: "set null" },
    email: { type: "text" },
    session_id: { type: "text" },
    ip: { type: "inet" },
    user_agent: { type: "text" },
    rate_limited: { type: "boolean", notNull: true, default: false },
    error: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.sql("CREATE INDEX idx_api_logs_created ON api_request_logs (created_at DESC)");
  pgm.sql("CREATE INDEX idx_api_logs_path ON api_request_logs (path, created_at DESC)");
  pgm.sql("CREATE INDEX idx_api_logs_uid ON api_request_logs (uid, created_at DESC)");
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("api_request_logs");
  pgm.dropTable("activity_logs");
};
