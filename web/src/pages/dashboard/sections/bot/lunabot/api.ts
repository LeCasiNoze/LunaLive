// web/src/pages/dashboard/sections/bot/api.ts
export {
  botTestSend,
  clearMyBotLogs,
  createMyBotAutopost,
  createMyBotCommand,
  deleteMyBotAutopost,
  deleteMyBotCommand,
  getMyBotAutoposts,
  getMyBotCommands,
  getMyBotLogs,
  getMyBotOverview,
  updateMyBotAutopost,
  updateMyBotCommand,
    // Calls (dashboard)
  getCallsConfig,
  patchCallsConfig,
  getCallsQueue,
  resetCallsQueue,
  deleteCallQueueItem,
  getCallsBans,
  banCalls,
  unbanCalls,
  getCallsProviderPolicy,
  setCallsProviderPolicy,
  allowCallsProviders,
  unallowCallsProviders,
  allowOnlyCallsProvider,
  searchSlots,
  getMyBotDiscordWelcome,
  setMyBotDiscordWelcome,

} from "../../../../../lib/api";

export type {
  ApiBotAutopost,
  ApiBotCommand,
  ApiBotLogRow,
  ApiBotOverview,
  ApiMyStreamer,
    // Calls (dashboard)
  ApiCallsConfig,
  ApiCallQueueItem,
  ApiCallBanRow,
  ApiProviderPolicy,
  ApiSlotSuggestion,
  ApiBotDiscordWelcome,

} from "../../../../../lib/api";
