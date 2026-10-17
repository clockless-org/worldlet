/** Public component API: the World's own account connections (Google Mail, Calendar and Drive; Notion, Todoist, Linear, PayPal, Supabase and GitHub through their official MCP servers; PostHog, Cloudflare and Google Search Console through their own APIs; HTTP JSON endpoints the person names; DoorDash through its official CLI). Cross-component consumers import this entry point. */
export {GoogleRestError,type GoogleQuery,type GoogleRest,type MailReceipts} from './google/rest.ts';
export {DISCOVERY_QUERIES,MIN_PICTURE_WIDTH,MailText,compactMessage,contentImage,discover,jsonSize,readPage,tidyMail,type MailPage,type MailPicture} from './google/gmail.ts';
export {HtmlParser,unescape as htmlUnescape,type HtmlAttrs} from './google/html-parser.ts';
export {read as readDrive} from './google/drive.ts';
export {readCalendar,readDriveList,googleReadResult} from './google/reads.ts';
export {SEND_SCOPE,address as mailAddress,greeted,prepare as prepareMail,draftHash,reconcile as reconcileMail,send as sendMail} from './google/mail.ts';
export {normalize as normalizeSource,sourceFailure} from './google/normalize.ts';
export {mockGoogle,MOCK_GOOGLE_EMAIL} from './google/mock.ts';
// The connectors a person connects, one entry each: name, purpose, how it signs in and its short scope lists.
export {connectorTiles,connectorDisconnectQuestion,connectorFailure,type ConnectorTile,type ConnectorTileState} from './connector-tiles.ts';
export {CONNECTORS,CONNECTOR_TECHNICAL_WORDS,connector,connectorScopes,plainConnectorText,type Connector,type ConnectorFallback,type ConnectorMechanism} from './connectors.ts';
// MCP connectors (Notion, Todoist, Linear, PayPal, Supabase): the Platform gates the session (McpGate), Core reads.
export type {McpContent,McpToolResult,McpTool,McpSession,McpGate} from './mcp/session.ts';
export {ValueError as McpValueError} from './mcp/python.ts';
export {mcpPayload} from './mcp/payload.ts';
export {jsonSchemaValid} from './mcp/json-schema.ts';
export {READ_SHAPED,MCP_POLICY,fnmatchcase,mcpConfiguration,enabledMcpTools,type McpPolicy} from './mcp/policy.ts';
export {NOTION_ENDPOINT,NOTION_GATE,NOTION_MAX_TEXT,notion,readNotion,notionPageId,notionPayload,notionPage,displayText as notionDisplayText,readableMentions as notionReadableMentions} from './mcp/notion.ts';
export {collectNotionPage,readNotionContext} from './services/notion-context.ts';
export {NOTION_WRITE_OPERATIONS,NOTION_REVIEW_FOLDER,handleNotionWrite,publicReview as notionPublicReview,notionFingerprint,notionWriteArgs,type NotionReviewStore,type NotionWriteOptions} from './mcp/notion-writes.ts';
export {TODOIST_ENDPOINT,TODOIST_TOOLS,TODOIST_GATE,todoistTimeoutSeconds,todoistTaskId,todoist,readTodoist,reviewedTodoist} from './mcp/todoist.ts';
export {LINEAR_ENDPOINT,LINEAR_TOOLS,LINEAR_GATE,linearIssueId,linearListArguments,readLinear} from './mcp/linear.ts';
export {PAYPAL_ENDPOINTS,PAYPAL_GATE,paypalPayload,readPaypal} from './mcp/paypal.ts';
export {GITHUB_ENDPOINT,GITHUB_ENDPOINTS,GITHUB_TOOLS,GITHUB_GATE,GITHUB_LIMITS,githubRecordId,githubRepository,readGithub} from './mcp/github.ts';
export {SUPABASE_ENDPOINT,SUPABASE_TOOLS,SUPABASE_GATE,supabaseProjectId,readSupabase} from './mcp/supabase.ts';
// Worldlet Services read over their own API with a pasted key (PostHog, Cloudflare, Search Console): the Platform gates each request, Core reads.
export {privateAddress,type ServiceGate,type ServiceHttp} from './services/http.ts';
export {POSTHOG_GATE,POSTHOG_HOSTS,POSTHOG_SIGN_IN,POSTHOG_SIGN_IN_HOSTS,posthogProjects,type PosthogProject,POSTHOG_LIMITS,POSTHOG_LISTS,checkPosthog,hogqlSelect,posthogHost,posthogProject,posthogSettings,readPosthog,type PosthogSettings} from './services/posthog.ts';
export {CLOUDFLARE_API,CLOUDFLARE_EXECUTE,CLOUDFLARE_GATE,CLOUDFLARE_LIMITS,CLOUDFLARE_READS,CLOUDFLARE_SIGN_IN,CLOUDFLARE_SIGN_IN_READS,checkCloudflare,cloudflareAccount,cloudflareAccounts,cloudflareExecute,cloudflareExecuteAnswer,cloudflareSettings,readCloudflare,type CloudflareChoice,type CloudflareSettings} from './services/cloudflare.ts';
export {GOOGLE_TOKEN_URL,SEARCH_CONSOLE_API,SEARCH_CONSOLE_DIMENSIONS,SEARCH_CONSOLE_GATE,SEARCH_CONSOLE_LIMITS,SEARCH_CONSOLE_SCOPE,checkSearchConsole,readSearchConsole,searchConsoleAccessToken,searchConsoleAssertion,searchConsoleKey,searchConsoleSettings,searchConsoleSite,searchConsoleSpec,type SearchConsoleKey,type SearchConsoleSpec} from './services/search-console.ts';
export {HTTP_JSON_GATE,HTTP_JSON_LIMITS,HTTP_JSON_NAME,checkHttpJson,httpJsonBaseUrl,httpJsonEndpoints,httpJsonName,httpJsonPath,httpJsonRequest,httpJsonSettings,readHttpJson,type HttpJsonRequest,type HttpJsonSettings} from './services/http-json.ts';
// DoorDash's official CLI: which operations and arguments, and what reaches Fox; the Platform runs it.
export {DOORDASH_CLI_VERSION,DOORDASH_MUTATIONS,doordashArgs,cleanDoordash,validDoordashCheckout,doordashOutcome,type DoordashRun} from './doordash.ts';
// Service presets: named, saved reads of a Worldlet Service (a HogQL query, a GitHub search) that a board block names.
export {PRESET_REASONS,SERVICE_PRESET_ID,readServicePresetRead,readServicePresetSave,readStoredServicePreset,removeServicePreset,saveServicePreset,servicePresetRead} from './services/presets.ts';

export {SERVICE_SYNC_LIMITS,serviceSyncReadKey,configureServiceSync,serviceSyncStart,serviceSyncFailure,serviceSyncPage,finishServiceSyncPage} from './services/sync.ts';

export {OAUTH_CALLBACK_SCRIPT,oauthCallbackPage,type OAuthCallbackStatus} from './oauth-callback.ts';
