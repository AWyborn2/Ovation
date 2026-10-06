/**
 * The destination boundary (Meta publishing KTD12, R14). Scheduling, claiming,
 * retries and status live in the publish worker; everything that talks to a
 * social platform sits behind this interface, so a posting aggregator could
 * replace the Meta adapter without touching the worker.
 */

export type Platform = "facebook" | "instagram";
export type PostType = "feed" | "story";

/** What the worker knows about a club's connected accounts. */
export type DestinationAccount = {
  pageId: string;
  igUserId: string | null;
  /** The decrypted Page token. Never logged, never stored in the clear. */
  token: string;
};

/** One post, ready to go: absolute public JPEG URLs in order, plus caption. */
export type PreparedPost = {
  platform: Platform;
  postType: PostType;
  imageUrls: string[];
  /** Null for Stories, which carry no caption. */
  caption: string | null;
};

/**
 * The outcome of a publish step: the post is live (with its id), or the
 * platform is still processing the media and the worker should check again
 * on a later run (Instagram containers, KTD6a).
 */
export type PublishOutcome = { kind: "published"; postId: string } | { kind: "processing" };

/**
 * How a failure should be handled (KTD10):
 *  - transient: retry with backoff
 *  - token: the club must reconnect; hold its posts
 *  - duplicate: the platform says it already has this post; run the landed-check
 *  - permanent: fail now with the reason
 * `resetMedia` asks the worker to drop stored media ids and re-render
 * (an expired Instagram container).
 */
export type DestinationErrorKind = "transient" | "token" | "duplicate" | "permanent";

export class DestinationError extends Error {
  constructor(
    readonly kind: DestinationErrorKind,
    message: string,
    readonly code?: number,
    readonly resetMedia = false,
  ) {
    super(message);
    this.name = "DestinationError";
  }
}

export interface Destination {
  /**
   * Upload the media without making anything live, returning ids to persist
   * before the publish step (KTD6). Instagram: container ids (carousel
   * children, then the parent last). Facebook: unpublished photo ids.
   */
  createMedia(account: DestinationAccount, post: PreparedPost): Promise<string[]>;
  /** Make the post live from ids returned by `createMedia`. */
  publish(
    account: DestinationAccount,
    post: PreparedPost,
    mediaIds: string[],
  ): Promise<PublishOutcome>;
  /** The live post id when an earlier attempt already published these ids, else null. */
  findLanded(
    account: DestinationAccount,
    post: PreparedPost,
    mediaIds: string[],
  ): Promise<string | null>;
  /** Whether the stored credentials still work. */
  checkHealth(account: DestinationAccount): Promise<{ ok: true } | { ok: false; reason: string }>;
}
