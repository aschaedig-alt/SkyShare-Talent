// Deep links into the Front web app.
//
// CLIENT-SAFE on purpose: it holds no imports at all, so a browser component can
// use the same helper as the server. That is the whole point — the orientation
// history table previously hardcoded this URL inline because the helper it should
// have used lived in a module that pulls in Prisma, which meant the "one place to
// change it" was a fiction.
//
// The /open/<id> shape is not guesswork: lib/travel/from-email.ts and
// lib/events/front-event-scan.ts already build the same URL for inbound travel and
// event mail, so it is the established format in this codebase. Those older call
// sites still inline it; point them here if you are touching them anyway.

/** Open a Front conversation in the web app. */
export function frontConversationUrl(conversationId: string): string {
  return `https://app.frontapp.com/open/${conversationId}`;
}
