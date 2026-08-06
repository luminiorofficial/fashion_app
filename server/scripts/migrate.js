const fs = require("node:fs/promises");
const path = require("node:path");
const {Pool} = require("pg");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required. Add it to server/.env before running migrations.");

  const root = path.resolve(__dirname, "../..");
  const directory = path.join(root, "database/migrations");
  const files = (await fs.readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === "true"
      ? {rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"}
      : false,
  });

  try {
    const connection = await pool.query("SELECT current_database() AS database, current_user AS username");
    console.info(`Connected to ${connection.rows[0].database} as ${connection.rows[0].username}.`);
    const hasMigrationTable = (await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name")).rows[0].table_name;
    const applied = hasMigrationTable
      ? new Set((await pool.query("SELECT version FROM schema_migrations")).rows.map((row) => row.version))
      : new Set();

    for (const file of files) {
      const version = path.basename(file, ".sql");
      if (applied.has(version)) {
        console.info(`Already applied: ${version}`);
        continue;
      }
      const sql = await fs.readFile(path.join(directory, file), "utf8");
      await pool.query(sql);
      console.info(`Applied: ${version}`);
    }
    console.info("Database migrations are up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  if (error.position) console.error(`SQL error position: ${error.position}`);
  if (error.detail) console.error(`Detail: ${error.detail}`);
  if (error.hint) console.error(`Hint: ${error.hint}`);
  if (error.where) console.error(`Where: ${error.where}`);
  process.exitCode = 1;
});
