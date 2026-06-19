"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/** Opt-in dark mode toggle. Default is light; choice persists in localStorage
 *  and is applied pre-paint by the inline script in the root layout. */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center gap-2 rounded px-2.5 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white ${
        collapsed ? "justify-center" : "w-full"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
