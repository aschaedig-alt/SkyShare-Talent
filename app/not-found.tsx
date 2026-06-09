import Link from "next/link";
import { PageStatus } from "@/components/shared/PageStatus";

export default function NotFound() {
  return (
    <div>
      <PageStatus
        eyebrow="Page not found"
        title="That workspace does not exist"
        detail="The link may be outdated, or the workspace may have moved."
      />
      <div className="-mt-12 flex justify-center px-5">
        <Link
          href="/command-center"
          className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
        >
          Return to Command Center
        </Link>
      </div>
    </div>
  );
}
