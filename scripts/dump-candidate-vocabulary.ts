/**
 * READ-ONLY. Dumps everything the /candidates/manage page shows — pipeline
 * stages, tags and disposition reasons — as plain text you can paste into a
 * document, an email or a spreadsheet.
 *
 *   npx tsx scripts/dump-candidate-vocabulary.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import { getCandidateTagOptions } from "@/lib/data/candidates";
import { getStageList, getStageUsage } from "@/lib/data/candidate-stages";
import { getDispositionOverrides } from "@/lib/data/disposition-groups";
import { applicationOutcome, dispositionGroup, reasonKey, DISPOSITION_LABEL } from "@/lib/candidates/buckets";

async function main() {
  const [stages, usage, tags, overrides, applications] = await Promise.all([
    getStageList(),
    getStageUsage(),
    getCandidateTagOptions(),
    getDispositionOverrides(),
    prisma.candidateApplication.findMany({
      where: { candidate: { status: { not: "MERGED" } } },
      select: { status: true }
    })
  ]);

  const line = (s = "") => console.log(s);

  // ---------------- STAGES ----------------
  line("PIPELINE STAGES");
  line("(the Status dropdown, in pipeline order)");
  line();
  for (const [i, s] of stages.entries()) {
    const n = usage[s.value.toLowerCase()] ?? 0;
    line(`${String(i + 1).padStart(2)}. ${s.value.padEnd(22)} ${s.group.padEnd(7)} ${n} candidate${n === 1 ? "" : "s"}`);
  }
  const listed = new Set(stages.map((s) => s.value.toLowerCase()));
  const strays = Object.entries(usage).filter(([k]) => !listed.has(k));
  if (strays.length) {
    line();
    line("   On candidates but not offered:");
    for (const [k, n] of strays.sort((a, b) => b[1] - a[1])) line(`     ${k} — ${n}`);
  }

  // ---------------- TAGS ----------------
  const active = tags.filter((t) => !t.archived);
  const archived = tags.filter((t) => t.archived);

  line();
  line();
  line(`TAGS — ${tags.length} total, ${active.length} in use, ${archived.length} archived`);
  line("(live = candidates in the working list; total includes the archive)");
  line();
  line(`IN USE (${active.length})`);
  for (const t of active.sort((a, b) => b.live - a.live || a.label.localeCompare(b.label))) {
    line(`   ${String(t.live).padStart(4)} live / ${String(t.total).padStart(4)} total   ${t.label}${t.color ? "" : "   [no colour]"}`);
  }
  line();
  line(`ARCHIVED (${archived.length}) — hidden from the list and the filter, still on everyone who had them`);
  for (const t of archived.sort((a, b) => b.total - a.total)) {
    line(`   ${String(t.live).padStart(4)} live / ${String(t.total).padStart(4)} total   ${t.label}`);
  }

  // ---------------- REASONS ----------------
  const counts = new Map<string, number>();
  for (const a of applications) {
    const raw = a.status ?? "";
    if (!raw.trim()) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([raw, count]) => {
      const key = reasonKey(raw);
      const group = dispositionGroup(raw, applicationOutcome(raw, null, null), overrides);
      return { raw, count, group, chosen: Boolean(overrides[key]) };
    })
    .sort((a, b) => b.count - a.count);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group)!.push(r);
  }

  line();
  line();
  line(`DISPOSITION REASONS — ${rows.length} wordings folding into ${groups.size} groups`);
  line("(* = the group was chosen by hand, overriding the automatic guess)");
  line();
  const ordered = [...groups.entries()].sort(
    (a, b) =>
      b[1].reduce((n, r) => n + r.count, 0) - a[1].reduce((n, r) => n + r.count, 0)
  );
  for (const [group, list] of ordered) {
    const total = list.reduce((n, r) => n + r.count, 0);
    line(`${DISPOSITION_LABEL[group as keyof typeof DISPOSITION_LABEL]}  —  ${total} application${total === 1 ? "" : "s"}, ${list.length} wording${list.length === 1 ? "" : "s"}`);
    for (const r of list) {
      line(`   ${String(r.count).padStart(5)}  ${r.chosen ? "* " : "  "}${r.raw}`);
    }
    line();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
