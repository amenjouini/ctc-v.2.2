import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { dialogs } from "@/hooks/dialogs";
import { useT } from "@/i18n";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/**
 * A dialog that can never push the page taller than the viewport — it is
 * fixed, and its own body is the scroll region if the content is long.
 * Escape closes it, focus moves into it and returns to where it was.
 */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  tone = "dialog",
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  /** "result" sits one layer below dialogs, so a dialog opened from a
   *  result card (Quit) still lands on top of it */
  tone?: "dialog" | "result";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    dialogs.opened();
    const before = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const el = panel.current;
      if (!el || el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>("[autofocus], button, input, [href]") ?? el).focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, [href]")];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      dialogs.closed();
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`overlay ${tone === "result" ? "is-result" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.target === e.currentTarget && onClose?.()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
        >
          <motion.div
            ref={panel}
            tabIndex={-1}
            className="frame dialog-panel"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Leaving the table.
 *
 * A native window.confirm() is a browser chrome dialog dropped on top of a
 * hand-built pixel board — wrong typeface, wrong buttons, wrong everything.
 * This asks the same question in the game's own voice, and the destructive
 * option is the quiet one while staying is the loud one.
 */
export function QuitButton({
  label,
  warning,
  confirm = true,
  onLeave,
  className = "btn-wood",
  worldBox = false,
}: {
  label?: string;
  /** shown when leaving actually costs something, e.g. abandoning a live match */
  warning?: string;
  /** false leaves straight away — nothing is lost, so nothing to confirm */
  confirm?: boolean;
  /** runs just before navigating home, e.g. to give up the seat */
  onLeave?: () => void;
  className?: string;
  /** a solid object in the critters' world (it sits in the header) */
  worldBox?: boolean;
}) {
  const nav = useNavigate();
  const t = useT();
  const [asking, setAsking] = useState(false);
  const go = () => {
    onLeave?.();
    nav("/");
  };

  return (
    <>
      <button type="button" className={className} onClick={() => (confirm ? setAsking(true) : go())}
        data-world={worldBox ? "box" : undefined} data-world-id={worldBox ? "quit" : undefined}>
        {label ?? t("quit")}
      </button>

      <Modal open={asking} onClose={() => setAsking(false)} labelledBy="quit-title">
        <h2 className="title mb-3 text-center" style={{ fontSize: 24 }} id="quit-title">
          {t("leave_q")}
        </h2>
        <p className="copy text-center" style={{ color: "var(--paper-3)" }}>
          {warning ?? t("leave_default")}
        </p>

        <div className="mt-6 grid gap-2.5">
          <button type="button" className="btn btn-big w-full" onClick={() => setAsking(false)} autoFocus>
            {t("keep_playing")}
          </button>
          <button type="button" className="btn-quiet w-full" onClick={go}>
            {t("leave")}
          </button>
        </div>
      </Modal>
    </>
  );
}

export function BarLegend({ onPaper = false }: { onPaper?: boolean }) {
  const t = useT();
  const strong = { color: onPaper ? "var(--wood-1)" : "var(--paper-5)", fontWeight: 700 };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3" style={{ fontSize: 15 }}>
        <span className="bar exact" />
        <span style={strong}>{t("legend_exact")}</span>
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 15 }}>
        <span className="bar near" />
        <span style={strong}>{t("legend_near")}</span>
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 15 }}>
        <span className="bars is-empty" style={{ width: "var(--bar-w)", padding: 0, border: 0, background: "none" }}>
          <span className="bars-none" />
        </span>
        <span>{t("legend_absent")}</span>
      </div>
    </div>
  );
}

/** Cross digits off as you rule them out. The player's own notes: the
 *  game never fills them in. */
export function NotesPad({
  ruledOut, onToggle, onPaper = false,
}: { ruledOut?: Record<string, boolean>; onToggle: (d: string) => void; onPaper?: boolean }) {
  const t = useT();
  return (
    <>
      <p className={`eyebrow mb-3 ${onPaper ? "on-paper" : ""}`}>{t("ruled_out")}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {DIGITS.map((d) => (
          <button key={d} type="button" className="note" aria-pressed={Boolean(ruledOut?.[d])}
            aria-label={t("rule_out", { d })} onClick={() => onToggle(d)}>
            {d}
          </button>
        ))}
      </div>
      <p className={`hold-tip ${onPaper ? "on-paper" : ""}`}>{t("hold_tip")}</p>
    </>
  );
}

/** The desktop margin: the legend and the notes, nothing to read through. */
export function RailCards({
  ruledOut,
  onToggle,
}: {
  ruledOut?: Record<string, boolean>;
  onToggle?: (d: string) => void;
}) {
  return (
    <>
      <div className="frame card p-4">
        <BarLegend />
      </div>
      {onToggle && (
        <div className="parchment card p-4">
          <NotesPad ruledOut={ruledOut} onToggle={onToggle} onPaper />
        </div>
      )}
    </>
  );
}

/** A burst of pixels for a win. Purely decorative. */
export function Burst() {
  const bits = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const reach = 70 + ((i * 37) % 60);
    return { bx: Math.round(Math.cos(angle) * reach), by: Math.round(Math.sin(angle) * reach * 0.8 - 20) };
  });
  return (
    <span className="burst" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ "--bx": `${b.bx}px`, "--by": `${b.by}px`, animationDelay: `${(i % 3) * 60}ms` } as React.CSSProperties} />
      ))}
    </span>
  );
}
