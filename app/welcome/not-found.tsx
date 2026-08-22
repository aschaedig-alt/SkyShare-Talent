// Shown when /welcome is opened without a valid share token — an old link that
// has since been rotated, a truncated one, or the bare URL.
//
// The friendly copy is here because the person reading it is a brand new hire
// holding a link that no longer works, and a bare "404" tells them nothing about
// what to do next.
//
// MEASURED, because the obvious assumption is wrong: notFound() here does NOT
// produce a 404 status. It renders this page with HTTP 200, in the production
// build as well as in dev. The root layout has already started streaming by the
// time the page throws, so the status is committed — the response carries
// Next's NEXT_HTTP_ERROR_FALLBACK;404 marker and falls back to client
// rendering. A route that does not exist at all (/nope) still 404s properly;
// this is specific to throwing from inside a rendered page.
//
// That costs nothing here. What the status would have bought is keeping a
// forwarded link out of search results, and the robots noindex/nofollow tag on
// welcome/page.tsx does that directly — verified present on this render too.
// The actual gate is the token check, and no contact data reaches this page.
export default function WelcomeLinkNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">Welcome to SkyShare</p>
      <h1 className="mt-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">This link isn’t valid</h1>
      <p className="mt-3 text-sm leading-relaxed text-brand-grey dark:text-slate-400">
        Your contacts link may have expired, or the address may have been cut short when it was shared. Ask your
        recruiter or HR contact to send you a fresh one.
      </p>
    </main>
  );
}
