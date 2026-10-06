import { graph } from "./meta-client";
import {
  DestinationError,
  type Destination,
  type DestinationAccount,
  type PreparedPost,
  type PublishOutcome,
} from "./destination";

/**
 * Facebook Page + Instagram publishing through the Graph API (plan
 * 2026-10-06-001, KTD6, KTD6a). Every post type persists a Meta id before the
 * step that makes it live, so a retry can always ask "did this already land?"
 * instead of posting twice:
 *
 *  - Instagram: a container per image (carousel children then the parent, or
 *    one per story). Status is checked once per call; FINISHED publishes,
 *    IN_PROGRESS asks the worker to come back on a later run.
 *  - Facebook: every photo is uploaded unpublished first, then a feed post
 *    attaches them (one or many) or each becomes a Page story.
 */

/** Marker for an Instagram post whose container shows PUBLISHED. */
const containerRef = (id: string) => `container:${id}`;

function requireIg(account: DestinationAccount): string {
  if (!account.igUserId) {
    throw new DestinationError("permanent", "No Instagram account is linked to this Page.");
  }
  return account.igUserId;
}

/** The Instagram containers that actually get published. */
function igTargets(post: PreparedPost, mediaIds: string[]): string[] {
  if (post.postType === "story") return mediaIds;
  return mediaIds.length ? [mediaIds[mediaIds.length - 1]] : [];
}

type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "PUBLISHED" | "ERROR" | "EXPIRED";

async function containerStatus(id: string, token: string): Promise<ContainerStatus> {
  const res = await graph<{ status_code?: ContainerStatus }>(
    "GET",
    id,
    { fields: "status_code" },
    token,
  );
  return res.status_code ?? "IN_PROGRESS";
}

type FeedPost = {
  id: string;
  attachments?: {
    data?: {
      target?: { id?: string };
      subattachments?: { data?: { target?: { id?: string } }[] };
    }[];
  };
};

async function recentFeedPosts(account: DestinationAccount): Promise<FeedPost[]> {
  const res = await graph<{ data?: FeedPost[] }>(
    "GET",
    `${account.pageId}/published_posts`,
    { fields: "id,attachments{target{id},subattachments{target{id}}}", limit: 25 },
    account.token,
  );
  return res.data ?? [];
}

function attachedIds(post: FeedPost): string[] {
  const ids: string[] = [];
  for (const a of post.attachments?.data ?? []) {
    if (a.target?.id) ids.push(a.target.id);
    for (const s of a.subattachments?.data ?? []) if (s.target?.id) ids.push(s.target.id);
  }
  return ids;
}

/** Page stories already live, keyed by the photo id they were made from. */
async function recentStories(account: DestinationAccount): Promise<Map<string, string>> {
  const res = await graph<{ data?: { post_id?: string; media_id?: string }[] }>(
    "GET",
    `${account.pageId}/stories`,
    { fields: "post_id,media_id", limit: 25 },
    account.token,
  );
  const map = new Map<string, string>();
  for (const s of res.data ?? []) if (s.media_id && s.post_id) map.set(s.media_id, s.post_id);
  return map;
}

export const metaDestination: Destination = {
  async createMedia(account, post) {
    if (post.imageUrls.length === 0) throw new DestinationError("permanent", "Nothing to publish.");
    if (post.platform === "facebook") {
      const ids: string[] = [];
      for (const url of post.imageUrls) {
        const res = await graph<{ id: string }>(
          "POST",
          `${account.pageId}/photos`,
          { url, published: false },
          account.token,
        );
        ids.push(res.id);
      }
      return ids;
    }

    const ig = requireIg(account);
    if (post.postType === "story") {
      const ids: string[] = [];
      for (const url of post.imageUrls) {
        const res = await graph<{ id: string }>(
          "POST",
          `${ig}/media`,
          { image_url: url, media_type: "STORIES" },
          account.token,
        );
        ids.push(res.id);
      }
      return ids;
    }
    if (post.imageUrls.length === 1) {
      const res = await graph<{ id: string }>(
        "POST",
        `${ig}/media`,
        { image_url: post.imageUrls[0], caption: post.caption ?? undefined },
        account.token,
      );
      return [res.id];
    }
    const children: string[] = [];
    for (const url of post.imageUrls) {
      const res = await graph<{ id: string }>(
        "POST",
        `${ig}/media`,
        { image_url: url, is_carousel_item: true },
        account.token,
      );
      children.push(res.id);
    }
    const parent = await graph<{ id: string }>(
      "POST",
      `${ig}/media`,
      { media_type: "CAROUSEL", children: children.join(","), caption: post.caption ?? undefined },
      account.token,
    );
    return [...children, parent.id];
  },

  async publish(account, post, mediaIds): Promise<PublishOutcome> {
    if (mediaIds.length === 0) throw new DestinationError("permanent", "No media to publish.");

    if (post.platform === "facebook") {
      if (post.postType === "feed") {
        const params: Record<string, string> = {};
        if (post.caption) params.message = post.caption;
        mediaIds.forEach((id, i) => {
          params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
        });
        const res = await graph<{ id: string }>(
          "POST",
          `${account.pageId}/feed`,
          params,
          account.token,
        );
        return { kind: "published", postId: res.id };
      }
      const live = await recentStories(account);
      const postIds: string[] = [];
      for (const photoId of mediaIds) {
        const existing = live.get(photoId);
        if (existing) {
          postIds.push(existing);
          continue;
        }
        const res = await graph<{ post_id: string }>(
          "POST",
          `${account.pageId}/photo_stories`,
          { photo_id: photoId },
          account.token,
        );
        postIds.push(res.post_id);
      }
      return { kind: "published", postId: postIds.join(",") };
    }

    const ig = requireIg(account);
    const postIds: string[] = [];
    for (const id of igTargets(post, mediaIds)) {
      const status = await containerStatus(id, account.token);
      if (status === "PUBLISHED") {
        postIds.push(containerRef(id));
        continue;
      }
      if (status === "IN_PROGRESS") return { kind: "processing" };
      if (status === "EXPIRED") {
        throw new DestinationError(
          "transient",
          "Instagram media expired before publishing.",
          undefined,
          true,
        );
      }
      if (status === "ERROR") {
        throw new DestinationError("permanent", "Instagram could not process the image.");
      }
      const res = await graph<{ id: string }>(
        "POST",
        `${ig}/media_publish`,
        { creation_id: id },
        account.token,
      );
      postIds.push(res.id);
    }
    return { kind: "published", postId: postIds.join(",") };
  },

  async findLanded(account, post, mediaIds) {
    if (mediaIds.length === 0) return null;
    if (post.platform === "instagram") {
      const targets = igTargets(post, mediaIds);
      for (const id of targets) {
        if ((await containerStatus(id, account.token)) !== "PUBLISHED") return null;
      }
      return targets.map(containerRef).join(",");
    }
    if (post.postType === "story") {
      const live = await recentStories(account);
      const found = mediaIds.map((id) => live.get(id));
      return found.every(Boolean) ? (found as string[]).join(",") : null;
    }
    const wanted = new Set(mediaIds);
    for (const p of await recentFeedPosts(account)) {
      if (attachedIds(p).some((id) => wanted.has(id))) return p.id;
    }
    return null;
  },

  async checkHealth(account) {
    try {
      await graph("GET", account.pageId, { fields: "id" }, account.token);
      if (account.igUserId) {
        await graph("GET", account.igUserId, { fields: "id" }, account.token);
      }
      return { ok: true };
    } catch (err) {
      if (!(err instanceof DestinationError) || err.kind === "transient") throw err;
      if (err.kind === "token") return { ok: false, reason: "Meta access was revoked or expired." };
      if (err.code === 10 || (err.code != null && err.code >= 200 && err.code < 300)) {
        return { ok: false, reason: "A required Meta permission was removed." };
      }
      return { ok: false, reason: err.message };
    }
  },
};

let override: Destination | null = null;

/** Test seam: swap the destination the worker uses (null restores Meta). */
export function setDestination(d: Destination | null): void {
  override = d;
}

export function destination(): Destination {
  return override ?? metaDestination;
}
