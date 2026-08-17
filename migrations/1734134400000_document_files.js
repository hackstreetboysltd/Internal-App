/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("document_files", {
    id: { type: "text", primaryKey: true },
    filename: { type: "text", notNull: true },
    mime_type: { type: "text" },
    size_bytes: { type: "integer", notNull: true },
    data: { type: "bytea", notNull: true },
    author_email: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  }, { ifNotExists: true });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("document_files");
};
