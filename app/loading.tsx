import { PageStatus } from "@/components/shared/PageStatus";

export default function Loading() {
  return <PageStatus eyebrow="Loading workspace" title="Preparing your view" detail="Loading the latest workspace data." />;
}
