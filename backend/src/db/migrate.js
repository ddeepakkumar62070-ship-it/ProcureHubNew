const fs = require('fs/promises');
const path = require('path');
const { closeDatabase, initializeDatabase, getPool } = require('../config/db');

async function isDuplicateSchemaChangeAlreadyPresent(error, statement, pool) {
  if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_DUP_INDEX', 'ER_FK_DUP_NAME'].includes(error.code)) {
    return false;
  }

  const alterTable = statement.match(/^ALTER\s+TABLE\s+`?([a-z_]+)`?/i);
  const createIndex = statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`?([a-z_]+)`?\s+ON\s+`?([a-z_]+)`?/i);
  const tableName = alterTable?.[1] || createIndex?.[2];
  if (!tableName) return false;

  const addedColumns = [...statement.matchAll(/\bADD\s+COLUMN\s+`?([a-z_]+)`?/gi)].map((match) => match[1]);
  const addedIndexes = [
    ...statement.matchAll(/\bADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`?([a-z_]+)`?/gi),
  ].map((match) => match[1]);
  if (createIndex) addedIndexes.push(createIndex[1]);

  if (addedColumns.length) {
    const [columns] = await pool.execute(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?`,
      [tableName],
    );
    const existing = new Set(columns.map((column) => column.COLUMN_NAME));
    if (!addedColumns.every((column) => existing.has(column))) return false;
  }
  if (addedIndexes.length) {
    const [indexes] = await pool.query(`SHOW INDEX FROM \`${tableName}\``);
    const existing = new Set(indexes.map((index) => index.Key_name));
    if (!addedIndexes.every((index) => existing.has(index))) return false;
  }
  return addedColumns.length > 0 || addedIndexes.length > 0;
}

async function runMigrations() {
  await initializeDatabase();
  const pool = getPool();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const migrationsDirectory = path.join(__dirname, 'migrations');
    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const [applied] = await pool.execute(
        'SELECT version FROM schema_migrations WHERE version = ?',
        [file],
      );
      if (applied.length) {
        console.log(`Already applied: ${file}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
      const connection = await pool.getConnection();
      try {
        for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) {
          try {
            await connection.query(statement);
          } catch (error) {
            if (await isDuplicateSchemaChangeAlreadyPresent(error, statement, pool)) {
              console.log(`Already present after an earlier partial run; skipping duplicate schema change.`);
              continue;
            }
            throw error;
          }
        }
        await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      } finally {
        connection.release();
      }
      console.log(`Applied: ${file}`);
    }

    const [rows] = await pool.query('SHOW TABLES');
    console.log(`Migration complete. ${rows.length} tables exist in the configured database.`);
  } finally {
    await closeDatabase();
  }
}

runMigrations().catch(async (error) => {
  console.error(`Database migration failed: ${error.message}`);
  try {
    await closeDatabase();
  } catch (closeError) {
    console.error(`Could not close the database pool: ${closeError.message}`);
  }
  process.exitCode = 1;
});
