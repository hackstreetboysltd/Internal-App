/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable(
    "message_identity_wrap_keys",
    {
      id: { type: "text", primaryKey: true },
      key: { type: "bytea", notNull: true },
      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
    },
    { ifNotExists: true },
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("message_identity_wrap_keys", { ifExists: true });
};
