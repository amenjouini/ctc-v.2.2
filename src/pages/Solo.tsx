import { useCallback, useState } from "react";
import type { Code } from "@shared/engine";
import { Masthead } from "@/components/Chrome";
import { Cheer, Critters } from "@/components/Critters";
import { Ledger } from "@/components/GuessRow";
import { Keypad } from "@/components/Keypad";
import { Modal, NotesPad, QuitButton, RailCards } from "@/components/Rail";
import { Reels } from "@/components/Reels";
import { useDraft, useGameKeys } from "@/hooks/useDraft";
import { useSoloGame, REVEALS_PER_DAY } from "@/hooks/useSoloGame";
import type { Theme } from "@/hooks/useTheme";
import { triesText, useLang, useT, verdictText } from "@/i18n";

export function Solo({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const game = useSoloGame();
  const t = useT();
  const lang = useLang();
  const draft = useDraft();
  const [askNew, setAskNew] = useState(false);
  /** the win card was closed to look back over the board */
  const [reviewing, setReviewing] = useState(false);

  const inProgress = game.turns.length > 0 && !game.solved;

  const fire = useCallback(() => {
    if (!draft.complete || game.solved) return;
    game.submit(draft.slots as Code);
    draft.clear();
  }, [draft, game]);

  const fresh = useCallback(() => {
    game.newGame();
    draft.clear();
    setReviewing(false);
    setAskNew(false);
  }, [game, draft]);

  useGameKeys(draft, fire, !game.solved);

  const spent = REVEALS_PER_DAY - game.revealsLeft;
  const readout =
    game.revealed && !game.solved
      ? t("revealed_readout", { code: game.code.join("") })
      : game.turns.length === 0
        ? ""
        : verdictText(lang, game.turns[game.turns.length - 1].verdict);
  const savedWarning = t("saved_warning");
  const tries = triesText(lang, game.turns.length);
  const showCode = game.revealed && !game.solved;

  return (
    <div className="shell relative mx-auto w-full max-w-[1160px]">
      <Masthead theme={theme} setTheme={setTheme} lead
        menuExtra={(close) => (
          <>
            {/* On a phone the header row is given to the board, so the
                game's own actions live here. */}
            <section className="menu-section sm:hidden">
              <p className="eyebrow mb-3">{t("this_game")}</p>
              <div className="grid gap-2.5">
                <button type="button" className="btn-wood w-full" onClick={() => { close(); if (inProgress) setAskNew(true); else fresh(); }}>{t("new_code")}</button>
                {!game.solved && (
                  <button type="button" className="btn-wood w-full" disabled={game.revealed || game.revealsLeft <= 0}
                    onClick={() => { game.reveal(); close(); }}>
                    {game.revealed ? t("code_shown") : t("show_code_left", { n: game.revealsLeft })}
                  </button>
                )}
                <QuitButton className="btn-quiet w-full" confirm={inProgress} warning={savedWarning} />
              </div>
            </section>
            <section className="menu-section lg:hidden">
              <NotesPad ruledOut={game.ruledOut} onToggle={game.toggleRuledOut} />
            </section>
          </>
        )}
        right={
        <>
          <div className="gauge max-sm:hidden" data-world="box" data-world-id="tries"><span>{t("tries")}</span><b>{game.turns.length}</b></div>
          <div className="gauge" data-world="box" data-world-id="best"><span>{t("best")}</span><b style={{ color: "var(--brass-3)" }}>{game.best ?? "--"}</b></div>
          <button type="button" className="btn-wood" data-world="box" data-world-id="new-code" onClick={() => (inProgress ? setAskNew(true) : fresh())}>{t("new_code")}</button>
          <QuitButton worldBox confirm={inProgress} warning={savedWarning} />
        </>
      } />

      <main className="shell-stage stage-solo">
        <section className="frame board" aria-label={t("your_board")}>
          <Critters theme={theme} />

          <div className="board-log">
            <div className="board-head">
              <p className="eyebrow">{t("your_guesses")}</p>
              <p className="eyebrow">
                <span className="sm:hidden">{t("best")} {game.best ?? "--"} &middot; </span>
                {tries}
              </p>
            </div>

            <Ledger turns={game.turns} onLoad={game.solved ? undefined : draft.load} label={t("your_guesses")}
              empty={<p className="eyebrow">{t("four_digits")}</p>} />

            {/* Shown only when it says something the bars do not. */}
            <p className={showCode ? "parchment readout is-alert" : "readout sr-only"} aria-live="polite">
              {readout}
            </p>
          </div>

          <div className="board-controls">
            <div className="reels-well">
              <Reels slots={draft.slots} active={draft.slot} locked={game.solved} onFocusSlot={draft.setSlot} />
            </div>

            <Keypad
              isBlocked={draft.isBlocked} ruledOut={game.ruledOut} disabled={game.solved}
              canErase={draft.used.length > 0} canSubmit={draft.complete && !game.solved} submitLabel={t("crack_it")}
              onPlace={draft.place} onErase={draft.clear} onSubmit={fire}
            />

            {game.solved ? (
              <button type="button" className="btn btn-big board-extra w-full" onClick={fresh}>{t("next_code")}</button>
            ) : (
              <button type="button" className="btn-wood board-extra flex w-full items-center justify-center gap-3.5 max-sm:hidden"
                disabled={game.revealed || game.revealsLeft <= 0}
                onClick={game.reveal}>
                <span>
                  {game.revealed ? t("code_shown")
                    : game.revealsLeft <= 0 ? t("no_reveals")
                    : t("show_code")}
                </span>
                <span className="flex gap-1" aria-label={t("reveals_left", { n: game.revealsLeft, max: REVEALS_PER_DAY })}>
                  {Array.from({ length: REVEALS_PER_DAY }).map((_, i) => (
                    <span key={i} className={`pip ${i < spent ? "spent" : ""}`} />
                  ))}
                </span>
              </button>
            )}
          </div>
        </section>

        <aside className="rail max-lg:hidden">
          <RailCards ruledOut={game.ruledOut} onToggle={game.toggleRuledOut} />
        </aside>
      </main>

      <Modal open={askNew} onClose={() => setAskNew(false)} labelledBy="new-title">
        <h2 className="title mb-3 text-center" style={{ fontSize: 16 }} id="new-title">{t("new_q")}</h2>
        <p className="copy text-center" style={{ color: "var(--paper-3)" }}>
          {t("new_warning")}
        </p>
        <div className="mt-6 grid gap-2.5">
          <button type="button" className="btn btn-big w-full" onClick={() => setAskNew(false)} autoFocus>{t("keep_this")}</button>
          <button type="button" className="btn-quiet w-full" onClick={fresh}>{t("new_code")}</button>
        </div>
      </Modal>

      <Modal open={game.solved && !reviewing} tone="result" labelledBy="solved-title" onClose={() => setReviewing(true)}>
        <div className="relative text-center">
          <Cheer theme={theme} />
          <h2 className="title mb-3" style={{ fontSize: 19 }} id="solved-title">{t("cracked")}</h2>
          {game.newBest && <p className="badge mb-3">{t("new_best")}</p>}
          <p className="copy" style={{ color: "var(--paper-4)" }}>
            {t("code_was", { tries })}
          </p>
          <div className="my-5 flex justify-center gap-2">
            {game.code.map((d, i) => <span key={i} className="digit is-gold">{d}</span>)}
          </div>
          {game.revealed && (
            <p className="copy mb-3" style={{ fontSize: 15, color: "var(--rose-4)" }}>
              {t("revealed_note")}
            </p>
          )}
          <button type="button" className="btn btn-big w-full" onClick={fresh} autoFocus>{t("next_code")}</button>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button type="button" className="btn-wood" onClick={() => setReviewing(true)}>{t("see_board")}</button>
            <QuitButton label={t("menu")} confirm={false} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
