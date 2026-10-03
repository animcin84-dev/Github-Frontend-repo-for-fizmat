"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const THEME_KEY = "si-theme";
const THEME_EVENT = "si-theme-change";

function readDarkTheme() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

function subscribe(onStoreChange: () => void) {
  const onThemeChange = () => onStoreChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    const saved = event.newValue;
    const nextDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
    onStoreChange();
  };

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemThemeChange = () => {
    if (localStorage.getItem(THEME_KEY)) return;
    document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    onStoreChange();
  };

  window.addEventListener(THEME_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemThemeChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemThemeChange);
  };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, readDarkTheme, () => false);

  function toggle() {
    const next = !readDarkTheme();
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      aria-pressed={dark}
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </Button>
  );
}
