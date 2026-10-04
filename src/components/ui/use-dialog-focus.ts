"use client";

import { useEffect, useRef } from "react";

/** Keep keyboard focus in an operator sheet and return it to its opener. */
export function useDialogFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const opener = document.activeElement as HTMLElement | null;
    const sheet = ref.current;
    const controls = () => Array.from(sheet.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); sheet.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {event.preventDefault();last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown", keydown);
    return () => {document.removeEventListener("keydown", keydown);opener?.focus();};
  }, [open, onClose]);
  return ref;
}
