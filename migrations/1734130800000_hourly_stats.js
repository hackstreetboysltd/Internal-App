/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("log_hourly_stats", {
    hour: { type: "timestamptz", primaryKey: true },
    request_count: { type: "integer", notNull: true, default: 0 },
    error_count: { type: "integer", notNull: true, default: 0 },
    rate_limited_count: { type: "integer", notNull: true, default: 0 },
    activity_count: { type: "integer", notNull: true, default: 0 },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("log_hourly_stats");
};
