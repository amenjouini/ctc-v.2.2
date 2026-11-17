import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Code } from "@shared/engine";
import { msUntilNextDay, shareGrid, type DailyStats } from "@shared/daily";
import { Masthead, Toast } from "@/components/Chrome";
import { Cheer } from "@/components/Critters";
import { Modal, QuitButton } from "@/components/Rail";
import { useDraft, useGameKeys } from "@/hooks/useDraft";
import { useDailyGame } from "@/hooks/useDailyGame";
import type { Theme } from "@/hooks/useTheme";
import { triesText, useLang, useT, verdictText } from "@/i18n";
import { shareText } from "@/share";
import { track } from "@/telemetry";
import { SoloBoard } from "./Solo";

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Time left until the next puzzle, ticking every second. */
function useCountdown(): number {
  const [left, setLeft] = useState(() => msUntilNextDay());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msUntilNextDay()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return left;
}

export function Daily({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const game = useDailyGame();
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const draft = useDraft();
  const [reviewing, setReviewing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fire = useCallback(() => {
    if (!draft.complete || game.solved) return;
    game.submit(draft.slots as Code);
    draft.clear();
  }, [draft, game]);

  useGameKeys(draft, fire, !game.solved);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const tries = triesText(lang, game.turns.length);
  const readout = game.turns.length ? verdictText(lang, game.turns[game.turns.length - 1].verdict) : "";

  const share = async () => {
    const url = `${window.location.origin}/daily`;
    const text = `${t("share_heading", { n: game.number })} · ${triesText(lang, game.tries ?? game.turns.length)}\n${shareGrid(game.turns.map((x) => x.verdict))}\n${url}`;
    const outcome = await shareText(text, t("share_heading", { n: game.number }));
    if (outcome === "copied") setToast(t("result_copied"));
    else if (outcome === "failed") setToast(t("share_failed"));
    if (outcome === "shared" || outcome === "copied") track("daily_share");
  };

  return (
    <div className="shell relative mx-auto w-full max-w-[1160px]">
      <Masthead theme={theme} setTheme={setTheme} lead
        menuExtra={(close) => (
          <section className="menu-section sm:hidden">
            <p className="eyebrow mb-3">{t("this_game")}</p>
            <div className="grid gap-2.5">
              {game.solved && <button type="button" className="btn-wood w-full" onClick={() => { close(); setReviewing(false); }}>{t("daily_results")}</button>}
              <QuitButton className="btn-quiet w-full" confirm={false} />
            </div>
          </section>
        )}
        right={
          <>
            <div className="gauge" data-world="box" data-world-id="daily"><span>{t("daily_short")}</span><b>#{game.number}</b></div>
            <div className="gauge" data-world="box" data-world-id="streak"><span>{t("streak")}</span><b style={{ color: "var(--brass-3)" }}>{game.stats.streak}</b></div>
            <QuitButton worldBox confirm={false} />
          </>
        } />

      <SoloBoard theme={theme} game={game} draft={draft} fire={fire} readout={readout} alert={false}
        headNote={tries}
        extra={game.solved ? (
          <button type="button" className="btn btn-big board-extra w-full" onClick={() => setReviewing(false)}>{t("daily_results")}</button>
        ) : (
          <p className="board-extra daily-note max-sm:hidden">{t("daily_note")}</p>
        )} />

      <Modal open={game.solved && !reviewing} tone="result" labelledBy="daily-title" onClose={() => setReviewing(true)}>
        <div className="relative text-center">
          <Cheer theme={theme} />
          <h2 className="title mb-3" style={{ fontSize: 24 }} id="daily-title">{t("daily_cracked", { n: game.number })}</h2>
          <p className="copy" style={{ color: "var(--paper-4)" }}>{t("code_was", { tries: triesText(lang, game.tries ?? game.turns.length) })}</p>
          <div className="my-4 flex justify-center gap-2">
            {game.code.map((d, i) => <span key={i} className="digit is-gold">{d}</span>)}
          </div>
          <button type="button" className="btn btn-big w-full" onClick={share} autoFocus>{t("share_result")}</button>
          <StatsPanel stats={game.stats} today={game.tries} />
          <NextPuzzle />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button type="button" className="btn-wood" onClick={() => nav("/solo")}>{t("play_free")}</button>
            <button type="button" className="btn-wood" onClick={() => setReviewing(true)}>{t("see_board")}</button>
          </div>
        </div>
      </Modal>
      <Toast message={toast} tone="info" />
    </div>
  );
}

function NextPuzzle() {
  const t = useT();
  const left = useCountdown();
  // The day has turned while the page was open: today's puzzle is the new one.
  if (left > 86_400_000 - 2000) {
    return (
      <button type="button" className="btn-wood mt-3 w-full" onClick={() => window.location.reload()}>{t("daily_ready")}</button>
    );
  }
  return (
    <p className="eyebrow mt-4">
      {t("next_daily")} <b className="daily-clock">{clock(left)}</b>
    </p>
  );
}

export function StatsPanel({ stats, today }: { stats: DailyStats; today: number | null }) {
  const t = useT();
  const top = Math.max(1, ...stats.spread.map((s) => s.count));
  const todayIdx = today === null ? -1 : today <= 3 ? 0 : today >= 10 ? stats.spread.length - 1 : today - 3;
  return (
    <div className="daily-stats mt-4">
      <dl className="daily-figures">
        <div><dt>{t("stats_played")}</dt><dd>{stats.played}</dd></div>
        <div><dt>{t("streak")}</dt><dd>{stats.streak}</dd></div>
        <div><dt>{t("stats_best_streak")}</dt><dd>{stats.maxStreak}</dd></div>
        <div><dt>{t("stats_average")}</dt><dd>{stats.average ?? "--"}</dd></div>
      </dl>
      <p className="eyebrow mt-3 mb-2">{t("stats_spread")}</p>
      <ol className="daily-spread">
        {stats.spread.map((s, i) => (
          <li key={s.label}>
            <span>{s.label}</span>
            <i className={i === todayIdx ? "is-today" : ""} style={{ width: `${Math.max(8, (s.count / top) * 100)}%` }}>{s.count}</i>
          </li>
        ))}
      </ol>
    </div>
  );
}
