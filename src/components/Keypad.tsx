import { useT } from "@/i18n";

const ORDER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/**
 * Ten digit keys plus Erase and Fire.
 *
 * The layout follows the width of the BOARD, not the window (a container
 * query in index.css): a narrow column gets 5+5 digits with a wide Erase /
 * Fire row beneath, a wide one gets the two action keys stacked in a sixth
 * column. The same component works in a phone portrait column, the right
 * half of a landscape phone and a desktop board without any breakpoints.
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
}

export function Keypad({
  isBlocked, ruledOut, disabled, canErase, canSubmit, submitLabel,
  onPlace, onErase, onSubmit,
}: Props) {
  const t = useT();
  return (
    <div className="keypad" role="group" aria-label={t("keypad")}>
      {ORDER.map((d) => (
        <button
          key={d}
          type="button"
          className={`key ${ruledOut?.[d] ? "is-noted" : ""}`}
          disabled={disabled || isBlocked(d)}
          aria-label={ruledOut?.[d] ? t("key_ruled_out", { d }) : d}
          onClick={() => onPlace(d)}
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
