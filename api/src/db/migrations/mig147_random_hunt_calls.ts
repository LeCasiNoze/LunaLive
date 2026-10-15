import type {Pool} from 'pg';
export async function mig147_random_hunt_calls(pool:Pool){
 await pool.query(`ALTER TABLE calls_queue ADD COLUMN IF NOT EXISTS hunt_generated boolean NOT NULL DEFAULT FALSE;`);
 await pool.query(`CREATE TABLE IF NOT EXISTS calls_hunt_generations(
 streamer_id bigint NOT NULL REFERENCES streamers(id), request_id text NOT NULL,
 added integer NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW(), PRIMARY KEY(streamer_id,request_id));`);
}
