import type { QueryResult, QueryResultRow } from "pg";
import { pool } from "../db.js";

export { pool };

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(sql, params);
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const r = await query<T>(sql, params);
  return r.rows[0] ?? null;
}

export async function all<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const r = await query<T>(sql, params);
  return r.rows;
}

export async function kvGet(key: string): Promise<string | null> {
  const r = await one<{ value: string }>("SELECT value FROM aurix_kv WHERE key=$1", [key]);
  return r?.value ?? null;
}

export async function kvGetInt(key: string, fallback?: number): Promise<number | null> {
  const v = await kvGet(key);
  if (v == null) return fallback ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback ?? null;
}

export async function kvSet(key: string, value: string | number | bigint): Promise<void> {
  await query(
    `INSERT INTO aurix_kv(key,value) VALUES($1,$2)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
    [key, String(value)]
  );
}
