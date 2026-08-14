/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("collection_items", {
    collection_name: { type: "text", notNull: true },
    id: { type: "text", notNull: true },
    data: { type: "jsonb", notNull: true },
    author_email: { type: "text" },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    deleted_at: { type: "timestamptz" },
  });

  pgm.addConstraint("collection_items", "collection_items_pkey", {
    primaryKey: ["collection_name", "id"],
  });

  pgm.sql(
    "CREATE INDEX idx_collection_items_name_updated ON collection_items (collection_name, updated_at DESC)",
  );
  pgm.sql(
    "CREATE INDEX idx_collection_items_active ON collection_items (collection_name) WHERE deleted_at IS NULL",
  );
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("collection_items");
};
