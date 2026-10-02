import { useCallback, useEffect, useState } from "react";

export const THEMES = ["dusk", "beach", "snow", "autumn"] as const;
export type Theme = (typeof THEMES)[number];

const KEY = "ctc.theme";

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "dusk";
  } catch {
    return "dusk";
  }
}

/** Theme lives on <html data-theme>, so CSS owns the whole palette swap. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(read);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  return { theme, setTheme };
}
