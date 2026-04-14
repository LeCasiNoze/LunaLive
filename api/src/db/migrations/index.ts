// api/src/db/migrations/index.ts (ou ton fichier migrateAll)
import type { Pool } from "pg";

import { mig001_core } from "./mig001_core.js";
import { mig002_chat_tables } from "./mig002_chat_tables.js";
import { mig003_users_upgrade } from "./mig003_users_upgrade.js";
import { mig004_streamers_upgrade } from "./mig004_streamers_upgrade.js";
import { mig005_provider_indexes } from "./mig005_provider_indexes.js";
import { mig006_chat_indexes } from "./mig006_chat_indexes.js";
import { mig007_live_stats } from "./mig007_live_stats.js";
import { mig008_follows } from "./mig008_follows.js";
import { mig009_push } from "./mig009_push.js";
import { mig010_wallet_economy } from "./mig010_wallet_economy.js";
import { mig011_rubis_ledger } from "./mig011_rubis_ledger.js";
import { mig012_streamer_chest } from "./mig012_streamer_chest.js";
import { mig013_daily_caps_wheels } from "./mig013_daily_caps_wheels.js";
import { mig014_daily_bonus } from "./mig014_daily_bonus.js";
import { mig015_cosmetics_equipped } from "./mig015_cosmetics_equipped.js";
import { mig016_trust_pilot } from "./mig016_trust_pilot.js";
import { mig017_trust_pilot_admin_upgrade } from "./mig017_trust_pilot_admin_upgrade.js";
import { mig018_casino_team_rating_decimal } from "./mig018_casino_team_rating_decimal.js";
import { mig019_sub_gifts } from "./mig019_sub_gifts.js";
import { mig020_host } from "./mig020_host.js";
import { mig020_chat_settings } from "./mig020_chat_settings.js";
import { mig021_streamer_tabs } from "./mig021_streamer_tabs.js";
import { mig022_bot_core } from "./mig022_bot_core.js";
import { mig023_chat_settings_calls } from "./mig023_chat_settings_calls.js";
import { mig024_calls_bans_policy } from "./mig024_calls_hunt_bans_policy.js";
import { mig025_calls_settings_hunt } from "./mig025_calls_settings_hunt.js";
import { mig026_bot_wheel } from "./mig026_bot_wheel.js";
import { mig027_predictions } from "./mig027_predictions.js";
import { mig028_user_talents } from "./mig028_user_upgrades.js";
import { mig029_stripe_subscriptions } from "./mig029_stripe_subscriptions.js";
import { mig030_comment_images_blob } from "./mig030_comment_images_blob.js";
import { mig031_streamer_offline_bg_blob } from "./mig031_streamer_offline_bg_blob.js";
import { mig032_emotes_gifs } from "./mig032_emotes_gifs.js";
import { mig033_account_actions } from "./mig033_account_actions.js";
import { mig034_agenda_notifs } from "./mig034_agenda_notifs.js";
import { mig035_reports } from "./mig035_reports.js";
import { mig036_reports_status_deleted } from "./mig036_reports_status_deleted.js";
import { mig037_chat_settings_dlive } from "./mig037_chat_settings_dlive.js";
import { mig038_site_content } from "./mig038_site_content.js";
import { mig039_dlive_pre_streamer } from "./mig039_dlive_pre_streamer.js";
import { mig_lunaclip } from "./mig_lunaclip.js";

// ✅ NEW
import { mig040_streamer_requests_fields } from "./mig040_streamer_requests_fields.js";
import { mig041_site_bans } from "./mig041_site_bans.js";
import { mig042_default_user_avatar_path } from "./mig042_default_user_avatar_path.js";
import { mig043_discord_linking } from "./mig043_discord_linking.js";
import { mig043_discord_guild_claim } from "./mig043_discord_guild_claim.js";
import { mig044_discord_daily_claims } from "./mig044_discord_daily_claims.js";
import { mig045_referrals_welcome } from "./mig045_referrals_welcome.js";
import { mig046_events_engine } from "./mig046_events_engine.js";
import { mig047_event_viewer_week } from "./mig047_event_viewer_week.js";
import { mig048_lunaclip_admin_ipc } from "./mig048_lunaclip_admin_ipc.js";
import { mig049_clips_thumbnail_url } from "./mig049_clips_thumbnail_url.js";
import { mig051_support_tickets } from "./mig051_support_tickets.js";
import { mig052_youtube_notifications } from "./mig052_youtube_notifications.js";
import { mig053_instagram_notifications } from "./mig053_instagram_notifications.js";
import { mig054_support_intelligence } from "./mig054_support_intelligence.js";
import { mig055_publish_jobs } from "./mig055_publish_jobs.js";
import { mig056_ig_comment_tracking } from "./mig056_ig_comment_tracking.js";
import { mig057_ig_comment_replies } from "./mig057_ig_comment_replies.js";
import { mig058_streamer_ig_offer_detail } from "./mig058_streamer_ig_offer_detail.js";
import { mig059_ig_dm_replies } from "./mig059_ig_dm_replies.js";
import { mig060_ig_config_constraints } from "./mig060_ig_config_constraints.js";
import { mig061_ig_config_instagram_username } from "./mig061_ig_config_instagram_username.js";
import { mig062_instagram_collaboration } from "./mig062_instagram_collaboration.js";
import { mig063_instagram_collab_unique } from "./mig063_instagram_collab_unique.js";

// Chat message stats (agrégation avant purge)
import { mig064_chat_message_stats } from "./mig064_chat_message_stats.js";
import { mig065_feature_events } from "./mig065_feature_events.js";
import { mig066_expenses } from "./mig066_expenses.js";
import { mig067_agency } from "./mig067_agency.js";
import { mig068_agency_monthly } from "./mig068_agency_monthly.js";
import { mig069_agency_stat_fields } from "./mig069_agency_stat_fields.js";
import { mig070_agency_access_code } from "./mig070_agency_access_code.js";
import { mig071_agency_public_note_and_negative_rs } from "./mig071_agency_public_note_and_negative_rs.js";
import { mig072_agency_payment_expenses } from "./mig072_agency_payment_expenses.js";
import { mig073_agency_payment_frequency } from "./mig073_agency_payment_frequency.js";
import { mig074_affi_landing_pages } from "./mig074_affi_landing_pages.js";
import { mig075_expenses_agency_unique_fix } from "./mig075_expenses_agency_unique_fix.js";
import { mig076_agency_ftd_full_benef } from "./mig076_agency_ftd_full_benef.js";
import { mig077_discord_casino_offers } from "./mig077_discord_casino_offers.js";

// Rumble migrations
import { mig040_rumble_info } from "./mig040_rumble_info.js";
import { mig041_rumble_accounts } from "./mig041_rumble_accounts.js";

export async function migrateAll(pool: Pool) {
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
  await mig015_cosmetics_equipped(pool);

  await mig016_trust_pilot(pool);
  await mig017_trust_pilot_admin_upgrade(pool);
  await mig018_casino_team_rating_decimal(pool);

  await mig019_sub_gifts(pool);
  await mig020_host(pool);
  await mig020_chat_settings(pool);

  await mig021_streamer_tabs(pool);
  await mig022_bot_core(pool);

  await mig023_chat_settings_calls(pool);
  await mig024_calls_bans_policy(pool);
  await mig025_calls_settings_hunt(pool);

  await mig026_bot_wheel(pool);

  await mig027_predictions(pool);
  await mig028_user_talents(pool);

  await mig029_stripe_subscriptions(pool);
  await mig030_comment_images_blob(pool);
  await mig031_streamer_offline_bg_blob(pool);
  await mig032_emotes_gifs(pool);

  await mig033_account_actions(pool);
  await mig034_agenda_notifs(pool);

  await mig035_reports(pool);
  await mig036_reports_status_deleted(pool);
  await mig037_chat_settings_dlive(pool);
  await mig038_site_content(pool);
  await mig039_dlive_pre_streamer(pool);

  // ✅ NEW: fields candidature streamer
  await mig040_streamer_requests_fields(pool);
  await mig041_site_bans(pool);
  await mig042_default_user_avatar_path(pool);
  await mig043_discord_linking(pool);
  await mig043_discord_guild_claim(pool);
  await mig044_discord_daily_claims(pool);
  await mig045_referrals_welcome(pool);
  await mig046_events_engine(pool);
  await mig047_event_viewer_week(pool);
  await mig_lunaclip(pool);
  await mig048_lunaclip_admin_ipc(pool);
  await mig049_clips_thumbnail_url(pool);
  await mig051_support_tickets(pool);
  await mig052_youtube_notifications(pool);
  await mig053_instagram_notifications(pool);
  await mig054_support_intelligence(pool);
  await mig055_publish_jobs(pool);
  await mig056_ig_comment_tracking(pool);
  await mig057_ig_comment_replies(pool);
  await mig058_streamer_ig_offer_detail(pool);
  await mig059_ig_dm_replies(pool);
  await mig060_ig_config_constraints(pool);
  await mig061_ig_config_instagram_username(pool);
  await mig062_instagram_collaboration(pool);
  await mig063_instagram_collab_unique(pool);

  await mig064_chat_message_stats(pool);
  await mig065_feature_events(pool);
  await mig066_expenses(pool);
  await mig067_agency(pool);
  await mig068_agency_monthly(pool);
  await mig069_agency_stat_fields(pool);
  await mig070_agency_access_code(pool);
  await mig071_agency_public_note_and_negative_rs(pool);
  await mig072_agency_payment_expenses(pool);
  await mig073_agency_payment_frequency(pool);
  await mig074_affi_landing_pages(pool);
  await mig075_expenses_agency_unique_fix(pool);
  await mig076_agency_ftd_full_benef(pool);
  await mig077_discord_casino_offers(pool);

  // Rumble migrations
  await mig040_rumble_info(pool);
  await mig041_rumble_accounts(pool);
}
