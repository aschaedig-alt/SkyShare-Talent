import { clsx } from "clsx";
import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  /** Tighter padding for dense rows/metric tiles. */
  padding?: "sm" | "md" | "lg";
  as?: "div" | "section" | "article" | "li";
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6"
};

/**
 * White card on the light page background: 12px radius, hairline 0.5px border,
 * no drop shadow (handoff §3). The base surface for every Compliments screen.
 */
export function Card({ children, className, padding = "md", as = "div" }: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={clsx(
        "rounded-card border-[0.5px] border-brand-lea/15 bg-white dark:border-white/10 dark:bg-brand-panel",
        PADDING[padding],
        className
      )}
    >
      {children}
    </Tag>
  );
}
