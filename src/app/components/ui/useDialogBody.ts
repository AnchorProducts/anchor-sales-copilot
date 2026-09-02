"use client";

import { useEffect } from "react";

// The two things every dialog in the app does to the page behind it, in one
// place so Modal and Sheet can't drift apart.
//
// 1. The page stops scrolling, so a dialog isn't a window onto content sliding
//    away under your thumb.
// 2. <body> is marked for exactly as long as a dialog is up. globals.css hangs
//    the floating app chrome off that mark — the mobile dock, the help bubble,
//    the back pill and the view-as chip all outrank or tie a dialog overlay and
//    would otherwise draw over it on a phone. The mark is COUNTED, so closing
//    one of two stacked dialogs doesn't bring the chrome back over the other.
export function useDialogBody(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const depth = Number(document.body.dataset.modalOpen || 0) + 1;
    document.body.dataset.modalOpen = String(depth);
    return () => {
      document.body.style.overflow = previousOverflow;
      const next = Number(document.body.dataset.modalOpen || 1) - 1;
      if (next > 0) document.body.dataset.modalOpen = String(next);
      else delete document.body.dataset.modalOpen;
    };
  }, [open]);
}

// Escape closes, when the caller offers a way out at all.
export function useDialogEscape(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}
