"use client";

import { useCallback, useEffect, useState } from "react";
import { translations, type Lang, type TranslationKey } from "./translations";
export type { Lang };

function readLang(): Lang {
  try {
    return (localStorage.getItem("anchor-lang") as Lang) || "en";
  } catch {
    return "en";
  }
}

export function useTranslation() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    setLang(readLang());

    // Re-render when another tab or the settings page changes the language
    function onStorage(e: StorageEvent) {
      if (e.key === "anchor-lang" && e.newValue) {
        setLang(e.newValue as Lang);
      }
    }
    // Custom event for same-tab changes
    function onLangChange(e: Event) {
      setLang((e as CustomEvent<Lang>).detail);
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("anchor-lang-change", onLangChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("anchor-lang-change", onLangChange);
    };
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return (translations[lang] as any)?.[key] ?? translations.en[key] ?? key;
    },
    [lang]
  );

  return { t, lang };
}

/** Call this instead of setting localStorage directly so same-tab components update instantly. */
export function setLanguage(l: Lang) {
  try {
    localStorage.setItem("anchor-lang", l);
    document.documentElement.setAttribute("lang", l);
    window.dispatchEvent(new CustomEvent("anchor-lang-change", { detail: l }));
  } catch {}
}
