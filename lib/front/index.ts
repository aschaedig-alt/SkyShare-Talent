// Front Core API client for SkyShare Talent-Ops. See .claude/skills/front-api for
// the endpoint reference, scope decisions, and the draft-first safety rationale.
//
// Not wired into any route yet — this is the ready-to-use client for when the
// FRONT_API_TOKEN lands. Typical use:
//
//   import { getOrientationChannelId, draftEmail } from "@/lib/front";
//   const channelId = await getOrientationChannelId();
//   await draftEmail(channelId, { to: "newhire@example.com", subject: "Welcome", body: "<p>...</p>" });

export { frontFetch, frontFetchBinary, paginate, FrontApiError } from "./client";
export {
  getChannelId,
  getOrientationChannelId,
  ORIENTATION_CHANNEL_ADDRESS,
} from "./config";
export {
  draftEmail,
  draftReply,
  sendEmail,
  sendReply,
  type EmailInput,
  type SentMessage,
} from "./messages";
export {
  iterateConversations,
  getMessages,
  addTags,
  listTags,
  resolveTagIds,
  resolveTagIdByNames,
  addComment,
  downloadAttachment,
  type FrontConversation,
  type FrontMessage,
} from "./inbound";
