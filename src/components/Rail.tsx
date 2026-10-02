import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { dialogs } from "@/hooks/dialogs";

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
  label = "Quit",
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
  const [asking, setAsking] = useState(false);
  const go = () => {
    onLeave?.();
    nav("/");
  };

  return (
    <>
      <button type="button" className={className} onClick={() => (confirm ? setAsking(true) : go())}
        data-world={worldBox ? "box" : undefined} data-world-id={worldBox ? "quit" : undefined}>
        {label}
      </button>

      <Modal open={asking} onClose={() => setAsking(false)} labelledBy="quit-title">
        <h2 className="title mb-3 text-center" style={{ fontSize: 17 }} id="quit-title">
          Leave the table?
        </h2>
        <p className="copy text-center" style={{ color: "var(--paper-3)" }}>
          {warning ?? "Your current board will be lost."}
        </p>

        <div className="mt-6 grid gap-2.5">
          <button type="button" className="btn btn-big w-full" onClick={() => setAsking(false)} autoFocus>
            Keep playing
          </button>
          <button type="button" className="btn-quiet w-full" onClick={go}>
            Leave
          </button>
        </div>
      </Modal>
    </>
  );
}

export function BarLegend({ onPaper = false }: { onPaper?: boolean }) {
  const strong = { color: onPaper ? "var(--wood-1)" : "var(--paper-5)" };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3" style={{ fontSize: 15 }}>
        <span className="bar exact" />
        <span>
          Right digit, <b style={strong}>right slot</b>
        </span>
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 15 }}>
        <span className="bar near" />
        <span>
          Right digit, <b style={strong}>wrong slot</b>
        </span>
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 15 }}>
        <span className="bar absent" />
        <span>Not in the code</span>
      </div>
    </div>
  );
}

/**
 * The three margin cards. Rendered as a sidebar on desktop and inside a
 * modal on narrow screens, because the shell never lets the page scroll —
 * anything stacked below the board would simply be unreachable.
 */
export function RailCards({
  ruledOut,
  onToggle,
  inModal,
}: {
  ruledOut?: Record<string, boolean>;
  onToggle?: (d: string) => void;
  inModal?: boolean;
}) {
  return (
    <>
      <div className={inModal ? "mb-4" : "frame card p-4"}>
        <p className="eyebrow mb-3" id="guide-title">
          Reading the bars
        </p>
        <BarLegend />
        <p className="copy mt-3" style={{ fontSize: 13.5, color: "var(--paper-3)" }}>
          Four bars, always &mdash; two over two. They are a <b style={{ color: "var(--brass-4)" }}>tally</b>,
          not a map: nothing about where a bar sits tells you which digit it means.
        </p>
      </div>

      <div className={inModal ? "parchment mb-4 p-4" : "parchment card p-4"}>
        <p className="eyebrow on-paper mb-3">The rule</p>
        <p className="copy" style={{ fontSize: 14.5 }}>
          The code is <b>four different digits</b> and it <b>never starts with zero</b>. That is
          why some keys grey out as you type.
        </p>
      </div>

      {onToggle && (
        <div className={inModal ? "parchment p-4" : "parchment card p-4"}>
          <p className="eyebrow on-paper mb-3">Ruled out</p>
          <div className="grid grid-cols-5 gap-1.5">
            {DIGITS.map((d) => (
              <button
                key={d}
                type="button"
                className="note"
                aria-pressed={Boolean(ruledOut?.[d])}
                aria-label={`Rule out ${d}`}
                onClick={() => onToggle(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="copy mt-2.5" style={{ fontSize: 13 }}>
            Cross off digits you have eliminated. These are your notes &mdash; the game never
            fills them in for you.
          </p>
        </div>
      )}
    </>
  );
}
