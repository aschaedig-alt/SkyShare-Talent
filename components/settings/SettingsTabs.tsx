"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

type SettingsTabsProps = {
  currentTab?: "general" | "users" | "activity" | "feedback";
};

const tabs = [
  { id: "general", label: "General", href: "/settings" },
  { id: "users", label: "Team Members", href: "/settings/users" },
  { id: "activity", label: "Activity", href: "/settings/activity" },
  { id: "feedback", label: "Feedback", href: "/settings/feedback" }
] as const;

export function SettingsTabs({ currentTab }: SettingsTabsProps) {
  const pathname = usePathname();

  // Determine active tab based on pathname if currentTab not provided
  const activeTab =
    currentTab ||
    (pathname === "/settings/users"
      ? "users"
      : pathname === "/settings/activity"
        ? "activity"
        : pathname === "/settings/feedback"
          ? "feedback"
          : "general");

  return (
    <div className="border-b border-brand-lea/10">
      <nav className="flex gap-8">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={clsx(
              "border-b-2 px-1 py-3 text-sm font-semibold transition",
              activeTab === tab.id
                ? "border-brand-lea text-brand-lea"
                : "border-transparent text-brand-grey hover:text-brand-lea"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
