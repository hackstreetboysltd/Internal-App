/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    email: { type: "text", notNull: true, unique: true },
    name: { type: "text" },
    avatar: { type: "text" },
    approved: { type: "boolean", notNull: true, default: false },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("role_access", {
    id: { type: "text", primaryKey: true },
    emails: { type: "jsonb", notNull: true, default: "[]" },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.sql(`
    INSERT INTO role_access (id, emails)
    VALUES
      ('allowed', '[]'::jsonb),
      ('admins', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("role_access");
  pgm.dropTable("users");
};
