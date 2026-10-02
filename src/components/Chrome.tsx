import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { THEMES, type Theme } from "@/hooks/useTheme";

const SWATCH: Record<Theme, JSX.Element> = {
  dusk: (<svg viewBox="0 0 8 8"><rect width="8" height="5" fill="#2a1a46" /><rect y="5" width="8" height="3" fill="#2a1324" /><rect x="5" y="1" width="2" height="2" fill="#fff4d2" /><rect x="1" y="3" width="2" height="2" fill="#edab3c" /></svg>),
  beach: (<svg viewBox="0 0 8 8"><rect width="8" height="4" fill="#3c93e2" /><rect y="4" width="8" height="2" fill="#2093c4" /><rect y="6" width="8" height="2" fill="#f5dea0" /><rect x="5" y="1" width="2" height="2" fill="#ffe898" /><polygon points="2,4 3,2 4,4" fill="#4a6a80" /></svg>),
  snow: (<svg viewBox="0 0 8 8"><rect width="8" height="5" fill="#202856" /><rect y="5" width="8" height="3" fill="#e4f0ff" /><rect x="5" y="1" width="2" height="2" fill="#fff" /><rect x="1" y="1" width="1" height="1" fill="#fff" /></svg>),
  autumn: (<svg viewBox="0 0 8 8"><rect width="8" height="5" fill="#d28d6c" /><rect y="5" width="8" height="3" fill="#96703a" /><rect x="4" y="1" width="3" height="2" fill="#ffe9ae" /><rect x="1" y="2" width="2" height="2" fill="#c9531f" /></svg>),
};

export function ThemePicker({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <div className="theme-picker" role="group" aria-label="Scene theme" data-world="box" data-world-id="themes">
      {THEMES.map((t) => (
        <button key={t} type="button" className="swatch" aria-pressed={theme === t}
          aria-label={`${t} theme`} title={t} onClick={() => setTheme(t)}>
          {SWATCH[t]}
        </button>
      ))}
    </div>
  );
}

/**
 * Title, page tools, theme picker. One row on a desktop; on anything
 * narrower the tools drop to their own full-width row so the title never
 * wraps and the picker never falls off the edge.
 */
export function Masthead({
  theme, setTheme, right, lead,
}: {
  theme: Theme; setTheme: (t: Theme) => void; right?: React.ReactNode;
  /** sits directly above a board, so leaves headroom for its critter */
  lead?: boolean;
}) {
  return (
    <header className={`masthead ${lead ? "stage-lead" : ""}`}>
      <Link to="/" className="title masthead-title" aria-label="Crack the Code">
        {/* one element per letter, so the critters can hang from them */}
        {Array.from("Crack the Code").map((ch, i) =>
          ch === " " ? <span key={i}> </span> : <span key={i} data-world="letter" aria-hidden="true">{ch}</span>,
        )}
      </Link>
      {right && <div className="toolbar">{right}</div>}
      <ThemePicker theme={theme} setTheme={setTheme} />
    </header>
  );
}

export type LinkState = "connecting" | "live" | "lost" | "closed";

const LINK_LABEL: Record<LinkState, string> = {
  connecting: "Connecting", live: "Connected", lost: "Reconnecting", closed: "Offline",
};

/** The table code with the connection light beside it. */
export function RoomBadge({ code, link }: { code: string; link: LinkState }) {
  return (
    <div className="gauge" title={LINK_LABEL[link]} data-world="box" data-world-id="table-code">
      <span className={`link-dot ${link}`} role="img" aria-label={LINK_LABEL[link]} />
      <span className="gauge-label max-sm:sr-only">Table</span>
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
