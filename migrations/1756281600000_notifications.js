/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("notifications", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    kind: { type: "text", notNull: true },
    module: { type: "text", notNull: true },
    action: { type: "text", notNull: true },
    item_name: { type: "text", notNull: true },
    actor_name: { type: "text", notNull: true },
    actor_email: { type: "text" },
    target_email: { type: "text" },
    mandatory: { type: "boolean", notNull: true, default: false },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("notification_reads", {
    notification_id: {
      type: "uuid",
      notNull: true,
      references: "notifications",
      onDelete: "cascade",
    },
    reader_email: { type: "text", notNull: true },
    read_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("notification_reads", "notification_reads_pkey", {
    primaryKey: ["notification_id", "reader_email"],
  });

  pgm.sql("CREATE INDEX idx_notifications_created ON notifications (created_at DESC)");
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("notification_reads");
  pgm.dropTable("notifications");
};
