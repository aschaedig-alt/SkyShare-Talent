/**
 * The REAL upload ceiling, and the message to show when a file exceeds it.
 *
 * Every upload route in this app declares a 25 MB limit. In production that
 * number is fiction: a hosted serverless function rejects a request body over
 * roughly 4.5 MB before it ever reaches the handler, so our own size check never
 * runs, the response is not JSON, and the caller sees an unexplained failure.
 * That is what "it's giving me an error" looked like from the other side.
 *
 * 4 MB rather than 4.5 leaves room for multipart encoding overhead, which is
 * counted against the same budget as the file itself.
 *
 * No node imports here on purpose — this module is imported by client
 * components as well as routes.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/** Says which file, how big it is, and what to do — never just "too large". */
export function tooLargeMessage(filename: string, bytes: number): string {
  return `${filename} is ${formatBytes(bytes)}, over the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit. Compress it or split it, then try again.`;
}
