// api/src/db/migrations/index.ts
import type { Pool } from "pg";

import { mig001_core } from "./mig001_core";
import { mig002_chat_tables } from "./mig002_chat_tables";
import { mig003_users_upgrade } from "./mig003_users_upgrade";
import { mig004_streamers_upgrade } from "./mig004_streamers_upgrade";
import { mig005_provider_indexes } from "./mig005_provider_indexes";
import { mig006_chat_indexes } from "./mig006_chat_indexes";
import { mig007_live_stats } from "./mig007_live_stats";
import { mig008_follows } from "./mig008_follows";
import { mig009_push } from "./mig009_push";
import { mig010_wallet_economy } from "./mig010_wallet_economy";
import { mig011_rubis_ledger } from "./mig011_rubis_ledger";
import { mig012_streamer_chest } from "./mig012_streamer_chest";
import { mig013_daily_caps_wheels } from "./mig013_daily_caps_wheels";
import { mig014_daily_bonus } from "./mig014_daily_bonus";

export async function migrateAll(pool: Pool) {
  // Ordre important (FK + backfills)
  await mig001_core(pool);
  await mig002_chat_tables(pool);

  await mig003_users_upgrade(pool);
  await mig004_streamers_upgrade(pool);

  await mig005_provider_indexes(pool);
  await mig006_chat_indexes(pool);

  await mig007_live_stats(pool);
  await mig008_follows(pool);
  await mig009_push(pool);

  await mig010_wallet_economy(pool);
  await mig011_rubis_ledger(pool);

  await mig012_streamer_chest(pool);
  await mig013_daily_caps_wheels(pool);
  await mig014_daily_bonus(pool);
}
