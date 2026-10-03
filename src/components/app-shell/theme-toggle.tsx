"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("si-theme");
    const initial = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = initial ? "dark" : "light";
  }, []);

  function toggle() {
    const current = document.documentElement.dataset.theme === "dark";
    const next = !current;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("si-theme", next ? "dark" : "light");
  }

  return <Button variant="ghost" size="sm" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>;
}
