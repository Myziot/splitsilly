import 'dotenv/config';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Runs the books/settlement-lock SQL migration idempotently.
// Usage: npx tsx src/db/migrate.ts
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:***@172.17.0.1:5432/splitsilly';
const sqlPath = path.join(__dirname, 'migrations', '0001_books_settlement_lock.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query(sql);
    // Verify
    const books = await client.query('SELECT count(*)::int n FROM books');
    const expNull = await client.query(
      `SELECT count(*)::int n FROM expenses e WHERE e.book_id IS NULL AND EXISTS (SELECT 1 FROM groups g WHERE g.id=e.group_id)`
    );
    const setNull = await client.query(
      `SELECT count(*)::int n FROM settlements s WHERE s.book_id IS NULL AND EXISTS (SELECT 1 FROM groups g WHERE g.id=s.group_id)`
    );
    console.log('Migration applied.');
    console.log('  books:', books.rows[0].n);
    console.log('  expenses without bookId (should be 0):', expNull.rows[0].n);
    console.log('  settlements without bookId (should be 0):', setNull.rows[0].n);
    if (expNull.rows[0].n !== 0 || setNull.rows[0].n !== 0) {
      throw new Error('Backfill incomplete: some rows lack a bookId.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
