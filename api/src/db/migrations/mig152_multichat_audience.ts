import type {Pool} from 'pg';
export async function mig152_multichat_audience(pool:Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS multichat_live_audience(
  platform TEXT PRIMARY KEY CHECK(platform IN ('kick','twitch')),
  channel_id TEXT NOT NULL, is_live BOOLEAN, viewers INTEGER CHECK(viewers>=0),
  observed_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), error TEXT);
 `);
}
