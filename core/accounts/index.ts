/** Public component API: the World's own account connections (Google Mail, Calendar and Drive; Notion, Todoist, Linear, PayPal and Supabase through their official MCP servers; DoorDash through its official CLI). Cross-component consumers import this entry point. */
export {GoogleRestError,type GoogleQuery,type GoogleRest,type MailReceipts} from './google/rest.ts';
export {DISCOVERY_QUERIES,MIN_PICTURE_WIDTH,MailText,compactMessage,contentImage,discover,jsonSize,readPage,tidyMail,type MailPage,type MailPicture} from './google/gmail.ts';
export {HtmlParser,unescape as htmlUnescape,type HtmlAttrs} from './google/html-parser.ts';
export {read as readDrive} from './google/drive.ts';
export {readCalendar,readDriveList,googleReadResult} from './google/reads.ts';
export {SEND_SCOPE,address as mailAddress,greeted,prepare as prepareMail,draftHash,reconcile as reconcileMail,send as sendMail} from './google/mail.ts';
export {normalize as normalizeSource,sourceFailure} from './google/normalize.ts';
export {mockGoogle,MOCK_GOOGLE_EMAIL} from './google/mock.ts';
// MCP connectors (Notion, Todoist, Linear, PayPal, Supabase): the Platform gates the session (McpGate), Core reads.
export type {McpContent,McpToolResult,McpTool,McpSession,McpGate} from './mcp/session.ts';
export {ValueError as McpValueError} from './mcp/python.ts';
export {mcpPayload} from './mcp/payload.ts';
export {jsonSchemaValid} from './mcp/json-schema.ts';
export {READ_SHAPED,MCP_POLICY,fnmatchcase,mcpConfiguration,enabledMcpTools,type McpPolicy} from './mcp/policy.ts';
export {NOTION_ENDPOINT,NOTION_GATE,NOTION_MAX_TEXT,notion,readNotion,notionPageId,notionPayload,notionPage,displayText as notionDisplayText,readableMentions as notionReadableMentions} from './mcp/notion.ts';
export {NOTION_WRITE_OPERATIONS,NOTION_REVIEW_FOLDER,handleNotionWrite,publicReview as notionPublicReview,notionFingerprint,type NotionReviewStore,type NotionWriteOptions} from './mcp/notion-writes.ts';
export {TODOIST_ENDPOINT,TODOIST_TOOLS,TODOIST_GATE,todoistTimeoutSeconds,todoistTaskId,todoist,readTodoist,reviewedTodoist} from './mcp/todoist.ts';
export {LINEAR_ENDPOINT,LINEAR_TOOLS,LINEAR_GATE,linearIssueId,linearListArguments,readLinear} from './mcp/linear.ts';
export {PAYPAL_ENDPOINTS,PAYPAL_GATE,paypalPayload,readPaypal} from './mcp/paypal.ts';
export {SUPABASE_ENDPOINT,SUPABASE_TOOLS,SUPABASE_GATE,supabaseProjectId,readSupabase} from './mcp/supabase.ts';
// DoorDash's official CLI: which operations and arguments, and what reaches Fox; the Platform runs it.
export {DOORDASH_CLI_VERSION,DOORDASH_MUTATIONS,doordashArgs,cleanDoordash,validDoordashCheckout,doordashOutcome,type DoordashRun} from './doordash.ts';
