import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:REDACTED@172.17.0.1:5432/splitsilly',
});

export const db = drizzle(pool, { schema });
