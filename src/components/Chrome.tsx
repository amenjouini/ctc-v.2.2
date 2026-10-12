import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { setSetting, useSettings } from "@/hooks/useSettings";
import { LANGS, useT, type Key, type Lang } from "@/i18n";
import { THEMES, type Theme } from "@/hooks/useTheme";
import { BarLegend, Modal } from "./Rail";

/* Each scene as a 12x12 postcard: big flat shapes, no detail. */
const SWATCH: Record<Theme, JSX.Element> = {
  dusk: (
    <svg viewBox="0 0 12 12">
      <rect width="12" height="12" fill="#2a1a46" />
      <rect y="5" width="12" height="2" fill="#663a64" />
      <rect y="7" width="12" height="1" fill="#dc8b5e" />
      <rect y="8" width="12" height="4" fill="#1d0d1c" />
      <rect x="8" y="1" width="3" height="3" fill="#fff4d2" />
      <rect x="1" y="1" width="1" height="1" fill="#fffae6" /><rect x="4" y="3" width="1" height="1" fill="#fffae6" />
      <rect x="2" y="6" width="1" height="1" fill="#10313e" /><rect x="1" y="7" width="3" height="1" fill="#10313e" />
      <rect x="6" y="5" width="1" height="1" fill="#10313e" /><rect x="5" y="6" width="3" height="2" fill="#10313e" />
    </svg>
  ),
  beach: (
    <svg viewBox="0 0 12 12">
      <rect width="12" height="12" fill="#4fa5ee" />
      <rect x="7" y="1" width="3" height="3" fill="#ffe76b" />
      <rect x="1" y="2" width="3" height="1" fill="#ffffff" />
      <rect y="6" width="12" height="3" fill="#2093c4" />
      <rect x="2" y="7" width="2" height="1" fill="#7fe3f0" /><rect x="7" y="6" width="3" height="1" fill="#7fe3f0" />
      <rect y="9" width="12" height="3" fill="#f5dea0" />
      <rect x="3" y="9" width="2" height="1" fill="#e8502c" /><rect x="3" y="10" width="1" height="1" fill="#e8502c" /><rect x="4" y="10" width="1" height="1" fill="#e8502c" />
    </svg>
  ),
  snow: (
    <svg viewBox="0 0 12 12">
      <rect width="12" height="12" fill="#202856" />
      <rect x="8" y="1" width="2" height="2" fill="#ffffff" />
      <rect x="2" y="1" width="1" height="1" fill="#ffffff" /><rect x="5" y="3" width="1" height="1" fill="#ffffff" />
      <rect x="1" y="5" width="1" height="1" fill="#ffffff" /><rect x="10" y="5" width="1" height="1" fill="#ffffff" />
      <rect y="8" width="12" height="4" fill="#e4f0ff" />
      <rect x="6" y="4" width="1" height="1" fill="#ffffff" />
      <rect x="5" y="5" width="3" height="1" fill="#16564f" /><rect x="4" y="6" width="5" height="2" fill="#16564f" />
      <rect x="2" y="9" width="3" height="1" fill="#93afd6" /><rect x="8" y="10" width="3" height="1" fill="#93afd6" />
    </svg>
  ),
  autumn: (
    <svg viewBox="0 0 12 12">
      <rect width="12" height="12" fill="#d28d6c" />
      <rect y="4" width="12" height="4" fill="#efbc69" />
      <rect y="8" width="12" height="4" fill="#6b4c2e" />
      <rect x="6" y="2" width="4" height="4" fill="#c9531f" /><rect x="7" y="1" width="2" height="1" fill="#c9531f" />
      <rect x="5" y="3" width="1" height="2" fill="#c9531f" /><rect x="10" y="3" width="1" height="2" fill="#c9531f" />
      <rect x="8" y="2" width="1" height="1" fill="#ffc061" />
      <rect x="7" y="6" width="2" height="3" fill="#41100f" />
      <rect x="2" y="5" width="1" height="1" fill="#c9531f" /><rect x="3" y="9" width="1" height="1" fill="#ff8f1f" /><rect x="1" y="10" width="1" height="1" fill="#c9531f" />
    </svg>
  ),
};

export function ThemePicker({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const t = useT();
  return (
    <div className="theme-picker" role="group" aria-label={t("scene")}>
      {THEMES.map((name) => (
        <button key={name} type="button" className="swatch" aria-pressed={theme === name} onClick={() => setTheme(name)}>
          {SWATCH[name]}
          <span>{t(`theme_${name}` as Key)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Everything that is not the game itself, behind one button: how to play,
 * the scene, settings. `extra` is whatever the current page wants to add
 * (the solo board puts its notes here on a phone).
 */
function Menu({
  open, onClose, theme, setTheme, extra,
}: { open: boolean; onClose: () => void; theme: Theme; setTheme: (t: Theme) => void; extra?: MenuExtra }) {
  const settings = useSettings();
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} labelledBy="menu-title">
      <p className="sr-only" id="menu-title">{t("menu")}</p>
      {typeof extra === "function" ? extra(onClose) : extra}
      <section className="menu-section">
        <p className="eyebrow mb-3">{t("how_to_play")}</p>
        <p className="copy mb-3" style={{ fontSize: 15 }}>
          {t("how_rule")}
        </p>
        <BarLegend />
        <p className="copy muted mt-3" style={{ fontSize: 14 }}>
          {t("how_bars")}
        </p>
      </section>
      <section className="menu-section">
        <p className="eyebrow mb-3">{t("scene")}</p>
        <ThemePicker theme={theme} setTheme={setTheme} />
      </section>
      <section className="menu-section">
        <p className="eyebrow mb-3">{t("settings")}</p>
        <button type="button" className="toggle" aria-pressed={settings.critters}
          onClick={() => setSetting("critters", !settings.critters)}>
          <span>{t("characters")}</span><i />
        </button>
        <div className="lang-picker mt-2.5" role="group" aria-label={t("language")}>
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <button key={l} type="button" className={settings.lang === l ? "btn" : "btn-wood"} aria-pressed={settings.lang === l}
              lang={l} onClick={() => setSetting("lang", l)}>
              {LANGS[l]}
            </button>
          ))}
        </div>
      </section>
      <button type="button" className="btn-wood mt-5 w-full" onClick={onClose}>{t("close")}</button>
    </Modal>
  );
}

/** What a page adds to the menu: sections of its own. A function gets
 *  `close`, for actions that should shut the menu behind them. */
export type MenuExtra = React.ReactNode | ((close: () => void) => React.ReactNode);

/**
 * Title, page tools, menu button. One row on a desktop; on anything
 * narrower the tools drop to their own full-width row so the title never
 * wraps.
 */
export function Masthead({
  theme, setTheme, right, lead, menuExtra,
}: {
  theme: Theme; setTheme: (t: Theme) => void; right?: React.ReactNode;
  /** sits directly above a board, so leaves headroom for its critter */
  lead?: boolean;
  menuExtra?: MenuExtra;
}) {
  const [menu, setMenu] = useState(false);
  const t = useT();
  return (
    <header className={`masthead ${lead ? "stage-lead" : ""}`}>
      <Link to="/" className="title masthead-title" aria-label="Crack the Code">
        {/* one element per letter, so the critters can hang from them */}
        {Array.from("Crack the Code").map((ch, i) =>
          ch === " " ? <span key={i}> </span> : <span key={i} data-world="letter" aria-hidden="true">{ch}</span>,
        )}
      </Link>
      {right && <div className="toolbar">{right}</div>}
      <button type="button" className="menu-btn" aria-label={t("menu")} aria-haspopup="dialog"
        data-world="box" data-world-id="menu" onClick={() => setMenu(true)}>
        <svg viewBox="0 0 10 10" aria-hidden="true" shapeRendering="crispEdges">
          <rect x="1" y="1" width="8" height="2" fill="currentColor" />
          <rect x="1" y="4" width="8" height="2" fill="currentColor" />
          <rect x="1" y="7" width="8" height="2" fill="currentColor" />
        </svg>
      </button>
      <Menu open={menu} onClose={() => setMenu(false)} theme={theme} setTheme={setTheme} extra={menuExtra} />
    </header>
  );
}

export type LinkState = "connecting" | "live" | "lost" | "closed";

const LINK_LABEL: Record<LinkState, string> = {
  connecting: "Connecting", live: "Connected", lost: "Reconnecting", closed: "Offline",
};

/** The table code with the connection light beside it. */
export function RoomBadge({ code, link }: { code: string; link: LinkState }) {
  const t = useT();
  return (
    <div className="gauge" title={LINK_LABEL[link]} data-world="box" data-world-id="table-code">
      <span className={`link-dot ${link}`} role="img" aria-label={LINK_LABEL[link]} />
      <span className="gauge-label max-sm:sr-only">{t("table")}</span>
      <b>{code}</b>
    </div>
  );
}

/** One short message at a time, pinned to the top where it covers nothing
 *  that matters and never shifts the layout. */
export function Toast({ message, tone = "warn" }: { message: string | null; tone?: "warn" | "info" }) {
  return (
    <div className="toast-layer" aria-live="assertive">
      <AnimatePresence>
        {message && (
          <motion.p key={message} className={`toast ${tone}`}
            initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18 }}>
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
