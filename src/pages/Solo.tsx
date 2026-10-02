import { useCallback, useState } from "react";
import type { Code } from "@shared/engine";
import { Masthead } from "@/components/Chrome";
import { Critters } from "@/components/Critters";
import { Ledger } from "@/components/GuessRow";
import { Keypad } from "@/components/Keypad";
import { Modal, QuitButton, RailCards } from "@/components/Rail";
import { Reels } from "@/components/Reels";
import { useDraft, useGameKeys } from "@/hooks/useDraft";
import { useSoloGame, REVEALS_PER_DAY } from "@/hooks/useSoloGame";
import type { Theme } from "@/hooks/useTheme";

export function Solo({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const game = useSoloGame();
  const draft = useDraft();
  const [guide, setGuide] = useState(false);
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
      ? `The code is ${game.code.join("")}. This round will not count towards your best.`
      : game.turns.length === 0
        ? "Pick four different digits, then crack it."
        : game.readout;

  return (
    <div className="shell relative mx-auto w-full max-w-[1160px]">
      <Masthead theme={theme} setTheme={setTheme} lead right={
        <>
          <div className="gauge max-sm:hidden" data-world="box" data-world-id="tries"><span>Tries</span><b>{game.turns.length}</b></div>
          <div className="gauge" data-world="box" data-world-id="best"><span>Best</span><b style={{ color: "var(--brass-3)" }}>{game.best ?? "--"}</b></div>
          <button type="button" className="btn-wood lg:hidden" data-world="box" data-world-id="guide" onClick={() => setGuide(true)}>Guide</button>
          <button type="button" className="btn-wood" data-world="box" data-world-id="new-code" onClick={() => (inProgress ? setAskNew(true) : fresh())}>New code</button>
          <QuitButton worldBox confirm={inProgress} warning="Your board is saved on this device, so you can pick it up again later." />
        </>
      } />

      <main className="shell-stage stage-solo">
        <section className="frame board" aria-label="Your board">
          <Critters theme={theme} />

          <div className="board-log">
            <div className="board-head">
              <p className="eyebrow">Your guesses</p>
              <p className="eyebrow">
                {game.turns.length === 0 ? "Nothing yet" : `${game.turns.length} ${game.turns.length === 1 ? "try" : "tries"}`}
              </p>
            </div>

            <Ledger turns={game.turns} onLoad={game.solved ? undefined : draft.load} label="Your guesses"
              empty={<>
                <p className="eyebrow mb-2.5" style={{ fontSize: 11 }}>The code is set</p>
                <p>Four different digits are waiting.<br />A first guess is never wasted.</p>
              </>} />

            <p className={`parchment readout ${game.revealed && !game.solved ? "is-alert" : ""}`} aria-live="polite">
              {readout}
            </p>
          </div>

          <div className="board-controls">
            <div className="inset reels-well">
              <Reels slots={draft.slots} active={draft.slot} locked={game.solved} onFocusSlot={draft.setSlot} />
            </div>

            <Keypad
              isBlocked={draft.isBlocked} ruledOut={game.ruledOut} disabled={game.solved}
              canErase={draft.used.length > 0} canSubmit={draft.complete && !game.solved} submitLabel="Crack it"
              onPlace={draft.place} onErase={draft.clear} onSubmit={fire}
            />

            {game.solved ? (
              <button type="button" className="btn btn-big board-extra w-full" onClick={fresh}>Next code</button>
            ) : (
              <button type="button" className="btn-wood board-extra flex w-full items-center justify-center gap-3.5"
                disabled={game.revealed || game.revealsLeft <= 0}
                onClick={game.reveal}>
                <span>
                  {game.revealed ? "Code shown for this round"
                    : game.revealsLeft <= 0 ? "No reveals left today"
                    : "Give up — show the code"}
                </span>
                <span className="flex gap-1" aria-label={`${game.revealsLeft} of ${REVEALS_PER_DAY} reveals left today`}>
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

      <Modal open={guide} onClose={() => setGuide(false)} labelledBy="guide-title">
        <RailCards ruledOut={game.ruledOut} onToggle={game.toggleRuledOut} inModal />
        <button type="button" className="btn mt-5 w-full" onClick={() => setGuide(false)}>Close</button>
      </Modal>

      <Modal open={askNew} onClose={() => setAskNew(false)} labelledBy="new-title">
        <h2 className="title mb-3 text-center" style={{ fontSize: 16 }} id="new-title">Start a new code?</h2>
        <p className="copy text-center" style={{ color: "var(--paper-3)" }}>
          This board will be thrown away. It will not count against your best.
        </p>
        <div className="mt-6 grid gap-2.5">
          <button type="button" className="btn btn-big w-full" onClick={() => setAskNew(false)} autoFocus>Keep this one</button>
          <button type="button" className="btn-quiet w-full" onClick={fresh}>New code</button>
        </div>
      </Modal>

      <Modal open={game.solved && !reviewing} tone="result" labelledBy="solved-title" onClose={() => setReviewing(true)}>
        <div className="text-center">
          <h2 className="title mb-3" style={{ fontSize: 19 }} id="solved-title">Cracked it</h2>
          {game.newBest && <p className="badge mb-3">New best</p>}
          <p className="copy" style={{ color: "var(--paper-4)" }}>
            {game.turns.length} {game.turns.length === 1 ? "try" : "tries"}. The code was:
          </p>
          <div className="my-5 flex justify-center gap-2">
            {game.code.map((d, i) => <span key={i} className="digit is-gold">{d}</span>)}
          </div>
          {game.revealed && (
            <p className="copy mb-3" style={{ fontSize: 15, color: "var(--rose-4)" }}>
              Revealed round &mdash; not counted.
            </p>
          )}
          <button type="button" className="btn btn-big w-full" onClick={fresh} autoFocus>Next code</button>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button type="button" className="btn-wood" onClick={() => setReviewing(true)}>See the board</button>
            <QuitButton label="Menu" confirm={false} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
