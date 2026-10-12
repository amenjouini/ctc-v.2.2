import { motion } from "framer-motion";
import { CODE_LENGTH } from "@shared/engine";
import { useT } from "@/i18n";

interface Props {
  slots: string[];
  active: number;
  locked?: boolean;
  onFocusSlot?: (i: number) => void;
}

/**
 * The composer. The digit is plain text, always — an earlier build scrolled
 * a strip of digits into view and the value became invisible whenever the
 * transform was wrong. Visibility must never depend on an animation.
 */
export function Reels({ slots, active, locked, onFocusSlot }: Props) {
  const t = useT();
  return (
    <div className="flex gap-3 justify-center" role="group" aria-label={t("reels")}>
      {Array.from({ length: CODE_LENGTH }).map((_, i) => {
        const value = slots[i] ?? "";
        return (
          <button
            key={i}
            type="button"
            className="reel"
            aria-current={!locked && i === active ? "true" : "false"}
            aria-label={value ? t("slot_filled", { n: i + 1, d: value }) : t("slot_empty", { n: i + 1 })}
            onClick={() => onFocusSlot?.(i)}
            disabled={locked}
          >
            <motion.span
              key={value || "empty"}
              className="reel-face"
              initial={value ? { y: "48%", opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {value}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
