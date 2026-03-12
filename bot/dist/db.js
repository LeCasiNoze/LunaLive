import pg from "pg";
export function createPool(env) {
    const pool = new pg.Pool({
        connectionString: env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000
    });
    pool.on("error", (err) => {
        console.error("[bot][pg] pool error:", err);
    });
    return pool;
}
