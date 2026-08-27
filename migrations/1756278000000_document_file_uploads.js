/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("document_file_uploads", {
    id: { type: "text", primaryKey: true },
    filename: { type: "text", notNull: true },
    mime_type: { type: "text" },
    size_bytes: { type: "integer", notNull: true },
    total_chunks: { type: "integer", notNull: true },
    author_email: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  }, { ifNotExists: true });

  pgm.createTable("document_file_upload_chunks", {
    upload_id: {
      type: "text",
      notNull: true,
      references: "document_file_uploads",
      onDelete: "CASCADE",
    },
    chunk_index: { type: "integer", notNull: true },
    data: { type: "bytea", notNull: true },
  }, {
    ifNotExists: true,
    constraints: { primaryKey: ["upload_id", "chunk_index"] },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("document_file_upload_chunks", { ifExists: true, cascade: true });
  pgm.dropTable("document_file_uploads", { ifExists: true, cascade: true });
};
