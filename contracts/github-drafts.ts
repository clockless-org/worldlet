/** GitHub drafts (core/agent/GRANTS.md#github-drafts): a change on GitHub an Agent prepares and the person approves. An
 * Agent drafts it through the `worldlet` MCP server; the host reads the target as it is now and keeps that beside the
 * draft. Nothing is written until the person chooses Approve on the draft's Attention card. Then the host reads the
 * target again, refuses when it changed since the draft (its state, its updatedAt, or it is gone), and otherwise writes
 * once as the person's GitHub App. Hosts own IDs, clocks, storage and the network; Core decides
 * (core/agent/github-drafts.ts). */

/** What a draft writes. `issue.create`: a new Issue in `repo`. `issue.comment`: a comment on an Issue or pull request.
 * `labels.add` and `labels.remove`: labels on an Issue or pull request. `labels.set`: a label transition on an Issue or
 * pull request, checked against the labels the Agent read (optionally only those under one prefix, such as `state:`),
 * removing and adding only what differs. `issue.close` and `issue.reopen`: an Issue's state (not a pull request's). */
export type GithubWrite='issue.create'|'issue.comment'|'labels.add'|'labels.remove'|'labels.set'|'issue.close'|'issue.reopen';
export const GITHUB_WRITES:readonly GithubWrite[]=Object.freeze(['issue.create','issue.comment','labels.add','labels.remove','labels.set','issue.close','issue.reopen']);

/** `pending` until the person acts. `written` once GitHub accepted it (`result`; with a `reason` when only part of it
 * was, such as some labels removed and others refused). `stale` when the target changed after the draft, so nothing was
 * written. `failed` when GitHub refused the write. `unknown` when the write began but GitHub's answer never came back
 * (no answer, or Worldlet stopped mid-write) and no such new Issue was found: check GitHub before drafting it again.
 * `dismissed` when the person dismissed it. */
export type GithubDraftStatus='pending'|'written'|'stale'|'failed'|'unknown'|'dismissed';
export const GITHUB_DRAFT_STATUSES:readonly GithubDraftStatus[]=Object.freeze(['pending','written','stale','failed','unknown','dismissed']);

/** The target as the host read it when the draft was made: the repository for a new Issue, otherwise the Issue or pull
 * request. Approve compares the target as it is then with this. */
export interface GithubDraftTarget {
 kind:'repository'|'issue'|'pull request';
 /** An Issue or pull request: `open` or `closed`. A repository: `active` or `archived`. */
 state:string;
 /** GitHub's own `updated_at`. A repository's is not compared: stars and settings change it. */
 updatedAt:string;
 /** The target's title (an Issue or pull request) or full name (a repository): GitHub's text, data only. */
 title:string;
 /** The target on github.com. */
 url:string;
 /** An Issue or pull request's label names as GitHub returned them, when it did: what `labels.set` checks. */
 labels?:string[];
}

export interface GithubDraft {
 /** Host-made, file-name safe. */
 id:string;
 /** The Agent that drafted it, host-stamped from its token. */
 agentId:string;
 write:GithubWrite;
 /** `owner/repo`. */
 repo:string;
 /** The Issue or pull request; absent for `issue.create`. */
 number?:number;
 /** `issue.create`: the new Issue's title. */
 title?:string;
 /** `issue.create` and `issue.comment`: the exact text written. */
 body?:string;
 /** `issue.create`, `labels.add` and `labels.remove`; for `labels.set`, the labels (under `labelPrefix`) it leaves. */
 labels?:string[];
 /** `labels.set`: only labels starting with this are compared and changed (case-insensitive); absent, all of them. */
 labelPrefix?:string;
 /** `labels.set`: the labels (under `labelPrefix`) the Agent read, which the target must have exactly when it runs. */
 expectedLabels?:string[];
 target:GithubDraftTarget;
 status:GithubDraftStatus;
 /** Once written: what GitHub made or changed, on github.com. */
 resultUrl?:string;
 /** Why it was not written (`stale`, `failed`, `unknown`), or what part was not (`written`), in plain words. */
 reason?:string;
 /** `issue.create`: when Approve began the write, saved before GitHub is asked, so a create that Worldlet stopped in the
  * middle of is looked for on GitHub rather than posted again. */
 writeStartedAt?:string;
 createdAt:string;
 updatedAt:string;
 /** When the person approved, dismissed, or the host refused it. */
 settledAt?:string;
}

export const GITHUB_DRAFT_LIMITS=Object.freeze({
 title:256,body:8000,labels:10,label:50,
 /** Pending drafts one Agent may have at once. */
 pendingPerAgent:20,
 /** Drafts one `github-drafts/read` call returns, newest first. */
 read:50,
});

/** The World gateway targets (`github-drafts/<action>`): each its own Grant target. */
export const GITHUB_DRAFT_TARGET='github-drafts';
export const GITHUB_DRAFT_ACTIONS=Object.freeze({create:'github-drafts/create',read:'github-drafts/read'} as const);

/** `github-drafts/create` arguments, as the model sends them (any `agentId` is ignored). `target` is `owner/repo` for
 * `issue.create` and `owner/repo#123` otherwise. `labels.set` takes `expected` (the labels it read, under `prefix` when
 * one is given) and `set` (what they become): `{prefix:'state:',expected:['state:queued'],set:['state:running']}`. */
export interface GithubDraftCreate {write:GithubWrite;target:string;title?:string;body?:string;labels?:string[];prefix?:string;expected?:string[];set?:string[]}

/** Standing GitHub writes (core/agent/GRANTS.md#standing-github-writes): writes one Agent may run on one repository
 * without a card, under a Grant the person gives it in Settings › Agent › Access. Only a comment and a label transition
 * under one prefix: never a new Issue, closing or reopening. */
export type GithubStandingWrite='issue.comment'|'labels.set';
export const GITHUB_STANDING_WRITES:readonly GithubStandingWrite[]=Object.freeze(['issue.comment','labels.set']);
/** What the person chooses in Settings: `comment`, `labels` (move labels under one prefix) or `comment-labels` (both). */
export type GithubWriteGrantChoice='comment'|'labels'|'comment-labels';
export const GITHUB_WRITE_GRANT_CHOICES:readonly GithubWriteGrantChoice[]=Object.freeze(['comment','labels','comment-labels']);
/** One standing GitHub write Grant's reach, kept on the Grant (contracts/agent-identity.ts Grant.github): this
 * repository only, these writes only and, for `labels.set`, labels under this prefix only. */
export interface GithubWriteScope {repo:string;writes:GithubStandingWrite[];labelPrefix?:string}
/** The World gateway target (`github-writes/run`): its own Grant target, which only a standing GitHub write Grant names. */
export const GITHUB_WRITE_TARGET='github-writes';
export const GITHUB_WRITE_ACTIONS=Object.freeze({run:'github-writes/run'} as const);
/** `github-writes/run` arguments: a `github-drafts/create` of a standing write on `owner/repo#123`, and optionally the
 * Issue's state and `updatedAt` as the Agent read them, refused as stale when either differs when it runs. */
export interface GithubWriteRun extends GithubDraftCreate {write:GithubStandingWrite;expectedState?:'open'|'closed';expectedUpdatedAt?:string}
export const GITHUB_WRITE_LIMITS=Object.freeze({
 /** Repositories one Agent may hold a standing GitHub write Grant for. */
 grantsPerAgent:10,
});

/** The GitHub App the person connected as GitHub's write identity: kept only in the vault (`github-app`), never echoed
 * to a page, an Agent, a log or an event. */
export interface GithubAppCredentials {appId:string;installationId:string;privateKey:string}
