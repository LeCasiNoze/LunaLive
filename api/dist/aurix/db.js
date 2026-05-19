import { pool } from "../db.js";
export { pool };
export async function query(sql, params = []) {
    return pool.query(sql, params);
}
export async function one(sql, params = []) {
    const r = await query(sql, params);
    return r.rows[0] ?? null;
}
export async function all(sql, params = []) {
    const r = await query(sql, params);
    return r.rows;
}
export async function kvGet(key) {
    const r = await one("SELECT value FROM aurix_kv WHERE key=$1", [key]);
    return r?.value ?? null;
}
export async function kvGetInt(key, fallback) {
    const v = await kvGet(key);
    if (v == null)
        return fallback ?? null;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback ?? null;
}
export async function kvSet(key, value) {
    await query(`INSERT INTO aurix_kv(key,value) VALUES($1,$2)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`, [key, String(value)]);
}
