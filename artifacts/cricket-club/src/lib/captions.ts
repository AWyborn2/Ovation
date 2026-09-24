import { renderCaption as renderSharedCaption, type CaptionContext } from "@workspace/scorecard";
import type { ShareCardInput } from "./share-card";

// Caption rendering lives in @workspace/scorecard so the API's auto-drafts
// store exactly the caption the composer would produce (Social Studio KTD8).
export {
  PLATFORM_LIMITS,
  KNOWN_TOKENS,
  truncateForPlatform,
  captionAppLink,
  type Platform,
  type CaptionContext,
} from "@workspace/scorecard";

export const renderCaption = (
  template: string,
  input: ShareCardInput,
  ctx: CaptionContext,
): string => renderSharedCaption(template, input, ctx);
