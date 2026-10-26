import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { useT } from "@/i18n";

const ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/** How long a finger rests on a digit key before it counts as "rule out". */
const HOLD_MS = 450;
/** A finger that drifts further than this is scrolling, not holding. */
const SLOP_PX = 10;

/**
 * Ten digit keys plus Erase and Fire.
 *
 * The layout follows the width of the BOARD, not the window (a container
 * query in index.css): a narrow column gets 5+5 digits with a wide Erase /
 * Fire row beneath, a wide one gets the two action keys stacked in a sixth
 * column. The same component works in a phone portrait column, the right
 * half of a landscape phone and a desktop board without any breakpoints.
 *
 * Touch: a long press on a digit rules it out (or back in) instead of
 * placing it, so phone players can take notes without leaving the keypad.
 */
interface Props {
  isBlocked: (d: string) => boolean;
  ruledOut?: Record<string, boolean>;
  disabled?: boolean;
  canErase: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onPlace: (d: string) => void;
  onErase: () => void;
  onSubmit: () => void;
  /** Long press on a digit. Leave out to turn the gesture off. */
  onRuleOut?: (d: string) => void;
}

export function Keypad({
  isBlocked, ruledOut, disabled, canErase, canSubmit, submitLabel,
  onPlace, onErase, onSubmit, onRuleOut,
}: Props) {
  const t = useT();
  const hold = useLongPress(onRuleOut);

  return (
    <div className="keypad" role="group" aria-label={t("keypad")}>
      {ORDER.map((d) => (
        <button
          key={d}
          type="button"
          className={`key ${ruledOut?.[d] ? "is-noted" : ""}`}
          disabled={disabled || isBlocked(d)}
          aria-label={ruledOut?.[d] ? t("key_ruled_out", { d }) : d}
          {...hold(d)}
          onClick={() => { if (!hold.consumeClick()) onPlace(d); }}
        >
          {d}
        </button>
      ))}
      <button type="button" className="btn-wood key-erase" disabled={disabled || !canErase} onClick={onErase}>
        {t("erase")}
      </button>
      <button type="button" className="btn key-fire" disabled={!canSubmit} onClick={onSubmit}>
        {submitLabel}
      </button>
    </div>
  );
}

/**
 * Touch and pen only: a mouse already has the notes pad and never needs a
 * hidden gesture. When the hold fires, the click that follows the lift is
 * swallowed so the digit is not also placed.
 */
function useLongPress(onHold?: (d: string) => void) {
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const swallow = useRef(false);

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => cancel, []);

  const bind = (d: string) => {
    if (!onHold) return {};
    return {
      onPointerDown: (e: PointerEvent) => {
        cancel();
        swallow.current = false;
        if (e.pointerType === "mouse") return;
        const timer = window.setTimeout(() => {
          if (!press.current) return;
          press.current.fired = true;
          swallow.current = true;
          navigator.vibrate?.(15);
          onHold(d);
        }, HOLD_MS);
        press.current = { timer, x: e.clientX, y: e.clientY, fired: false };
      },
      onPointerMove: (e: PointerEvent) => {
        const p = press.current;
        if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // the phone's own long-press menu would land on top of the key
      onContextMenu: (e: MouseEvent) => { if (press.current || swallow.current) e.preventDefault(); },
    };
  };

  /** True once, for the click that ends a long press. */
  bind.consumeClick = () => {
    const was = swallow.current;
    swallow.current = false;
    return was;
  };
  return bind;
}
