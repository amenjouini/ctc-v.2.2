import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isRoomCode, makeRoomCode, normaliseRoom, type Code, type Verdict } from "@shared/engine";
import { NAME_MAX, cleanName, type RoomView } from "@shared/protocol";
import { BarMarks } from "@/components/BarMarks";
import { Cheer, Critters } from "@/components/Critters";
import { Ledger } from "@/components/GuessRow";
import { Keypad } from "@/components/Keypad";
import { Masthead, RoomBadge, Toast } from "@/components/Chrome";
import { Modal, QuitButton } from "@/components/Rail";
import { ChatIcon, ChatPanel } from "@/components/Chat";
import { Reels } from "@/components/Reels";
import { useDraft, useGameKeys } from "@/hooks/useDraft";
import { readName, saveName } from "@/hooks/usePlayerName";
import { hasSeat, useRoom, type RoomError } from "@/hooks/useRoom";
import type { Theme } from "@/hooks/useTheme";
import { errorText, triesText, useLang, useT, verdictText, type Key, type T } from "@/i18n";

/** Their best result so far — the pressure gauge. Deliberately the BEST,
 *  not the latest: that is the number that tells you how close you are to
 *  losing, and it means you never have to switch tabs just to check. */
function bestThreat(turns: { verdict: Verdict }[]): Verdict {
  return turns.reduce<Verdict>(
    (best, t) =>
      t.verdict.exact > best.exact ||
      (t.verdict.exact === best.exact && t.verdict.misplaced > best.misplaced)
        ? t.verdict
        : best,
    { exact: 0, misplaced: 0 },
  );
}

function statusLine(t: T, view: RoomView | null, link: string): { text: string; tone: "turn" | "wait" | "alert" } {
  if (link === "lost") return { text: t("st_lost"), tone: "alert" };
  if (!view) return { text: t("st_finding"), tone: "wait" };
  const them = view.opponent?.name ?? t("rival");
  switch (view.phase) {
    case "lobby":
      return { text: t("st_lobby"), tone: "wait" };
    case "setup":
      if (!view.you.ready) return { text: t("st_set"), tone: "turn" };
      return { text: t("st_waiting", { name: them }), tone: "wait" };
    case "play":
      return view.turn === view.seat
        ? { text: t("st_your_turn"), tone: "turn" }
        : { text: t("st_their_turn", { name: them }), tone: "wait" };
    case "over":
      return { text: t("st_over"), tone: "wait" };
  }
}

export function Room({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const { code = "" } = useParams();
  const room = normaliseRoom(code);
  const validRoom = isRoomCode(room);
  const nav = useNavigate();
  const t = useT();
  const lang = useLang();
  const location = useLocation();
  const create = Boolean((location.state as { create?: boolean } | null)?.create);

  const [name, setName] = useState(readName);
  // Someone arriving from a shared link picks a name before sitting down;
  // a returning player (or one who already has a name) goes straight in.
  const [seated, setSeated] = useState(() => cleanName(readName()).length > 0 || hasSeat(room));

  const r = useRoom({ room, name: cleanName(name), create, enabled: validRoom && seated });
  const { view, link, error, pending } = r;
  const draft = useDraft();

  const [tab, setTab] = useState<"mine" | "theirs">("mine");
  const [chatOpen, setChatOpen] = useState(false);
  /** the newest message of theirs that has been read (bubble tapped, or
   *  the messages opened); anything newer is waiting to be delivered */
  const [readUpTo, setReadUpTo] = useState<number | null>(null);
  /** your own secret stays behind its lock until you tap it */
  const [codeShown, setCodeShown] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ruledOut, setRuledOut] = useState<Record<string, boolean>>({});
  const [seenTheirs, setSeenTheirs] = useState(0);

  const phase = view?.phase ?? "lobby";
  const opp = view?.opponent ?? null;
  const them = opp?.name ?? t("rival");
  const myTurn = Boolean(view && phase === "play" && view.turn === view.seat);
  const settingSecret = Boolean(view && phase === "setup" && !view.you.ready);
  const canCompose = settingSecret || phase === "play";
  const canFire = draft.complete && link === "live" && !pending && (settingSecret || myTurn);

  // A table code that collided with a live table: quietly pick another.
  useEffect(() => {
    if (error?.code === "room_exists" && create) nav(`/room/${makeRoomCode()}`, { replace: true, state: { create: true } });
  }, [error, create, nav]);

  // When it becomes your move, the board with the keypad comes to you.
  useEffect(() => {
    if (myTurn || settingSecret) setTab("mine");
  }, [myTurn, settingSecret]);

  // Fresh match: fresh notes, fresh results card.
  useEffect(() => {
    if (phase === "setup") {
      setRuledOut({});
      setSeenTheirs(0);
      draft.clear();
    }
    if (phase !== "over") setReviewing(false);
    // keyed on the phase alone: this is a transition, not a sync
  }, [phase]);

  // Say so when a rival walks away, rather than silently resetting the table.
  const lastOpp = useRef<string | null>(null);
  useEffect(() => {
    if (opp) {
      lastOpp.current = opp.name;
      setNotice(null);
    } else if (lastOpp.current) {
      setNotice(t("left_notice", { name: lastOpp.current }));
      lastOpp.current = null;
    }
  }, [opp]);

  const theirCount = view?.theirHunt.length ?? 0;
  useEffect(() => {
    if (tab === "theirs") setSeenTheirs(theirCount);
  }, [tab, theirCount]);

  const submit = useCallback(() => {
    if (!canFire) return;
    const sent = settingSecret ? r.setSecret(draft.slots as Code) : r.guess(draft.slots as Code);
    if (sent) draft.clear();
  }, [canFire, settingSecret, r, draft]);

  useGameKeys(draft, submit, canCompose);

  const share = `${window.location.origin}/room/${room}`;
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share);
      setToast(t("link_copied"));
    } catch {
      setToast(t("link_manual"));
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const nativeShare = () =>
    navigator.share({ title: "Crack the Code", text: t("share_text", { code: room }), url: share }).catch(() => undefined);

  const takeSeat = () => {
    if (!cleanName(name)) return;
    saveName(name);
    setSeated(true);
  };

  const status = statusLine(t, view, link);
  const threat = bestThreat(view?.theirHunt ?? []);
  const lastMine = view?.yourHunt[view.yourHunt.length - 1];
  const lastTheirs = view?.theirHunt[view.theirHunt.length - 1];
  const unseen = tab === "mine" && theirCount > seenTheirs;

  const inMatch = phase === "setup" || phase === "play";
  const fatal: RoomError | null = !validRoom
    ? { code: "bad_room", reason: "That is not a table code.", fatal: true }
    : error?.fatal && error.code !== "room_exists"
      ? error
      : null;

  const board = (() => {
    if (fatal) return <FatalPanel error={fatal} onRetry={r.retry} />;
    if (!seated) {
      return (
        <div className="frame panel">
          <p className="eyebrow mb-2">{t("table_n", { code: room })}</p>
          <h2 className="title mb-3" style={{ fontSize: 16 }}>{t("take_seat")}</h2>
          <p className="copy muted mb-4">{t("pick_name")}</p>
          <form onSubmit={(e) => { e.preventDefault(); takeSeat(); }}>
            <label className="field-label" htmlFor="seat-name">{t("your_name")}</label>
            <input id="seat-name" className="field field-text mb-3 w-full" maxLength={NAME_MAX} autoFocus
              autoComplete="nickname" enterKeyHint="go" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-big w-full" disabled={!cleanName(name)}>{t("sit_down")}</button>
          </form>
        </div>
      );
    }
    if (!view) {
      return (
        <div className="frame panel text-center" aria-busy="true">
          <p className="eyebrow mb-3">{t("table_n", { code: room })}</p>
          <p className="loading-dots" aria-hidden="true"><i /><i /><i /></p>
          <p className="copy muted mt-3">{link === "lost" ? t("server_silent") : t("st_finding")}</p>
        </div>
      );
    }
    if (phase === "lobby") {
      return (
        <div className="frame panel text-center">
          {notice && <p className="notice mb-4">{notice}</p>}
          <p className="eyebrow mb-3">{t("share_code")}</p>
          <p className="title room-code mb-4">{room}</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-big" onClick={copy}>{t("copy_link")}</button>
            {canShare
              ? <button type="button" className="btn-wood" onClick={nativeShare}>{t("share")}</button>
              : <input className="field field-text w-full" readOnly value={share} aria-label={t("table_link")}
                  onFocus={(e) => e.currentTarget.select()} />}
          </div>
          <p className="copy muted" style={{ fontSize: 14 }}>{t("lobby_hint", { code: room, name: view.you.name })}</p>
        </div>
      );
    }
    return null;
  })();

  const chat = view?.chat ?? [];
  const newest = chat.length ? chat[chat.length - 1].id : 0;
  // Whatever was said before this page loaded is history, not news.
  useEffect(() => {
    if (view && readUpTo === null) setReadUpTo(newest);
  }, [view, readUpTo, newest]);
  // The newest thing they said that has not been read yet.
  const unheard = readUpTo === null ? undefined : [...chat].reverse().find((l) => !l.mine && l.id > readUpTo);
  const markRead = useCallback((id: number) => setReadUpTo((r) => Math.max(r ?? 0, id)), []);
  const seenAll = useCallback(() => markRead(newest), [markRead, newest]);
  const chatPanel = opp ? <ChatPanel lines={chat} them={opp.name} onSend={r.say} onSeen={seenAll} /> : null;

  const theirTabLabel = opp ? t("name_hunt", { name: opp.name }) : t("their_hunt");
  const leaveWarning = t("leave_warning", { name: them });

  return (
    <div className="shell relative mx-auto w-full max-w-[1160px]">
      <Masthead theme={theme} setTheme={setTheme}
        menuExtra={
          <>
            <section className="menu-section sm:hidden">
              <p className="eyebrow mb-3">{t("table_n", { code: room })}</p>
              <QuitButton className="btn-quiet w-full" label={t("leave_table")} confirm={inMatch} onLeave={r.leave}
                warning={leaveWarning} />
            </section>
          </>
        }
        right={
        <>
          <RoomBadge code={room} link={fatal ? "closed" : link} />
          <QuitButton worldBox confirm={inMatch} onLeave={r.leave}
            warning={leaveWarning} />
        </>
      } />

      <Toast message={toast ?? (error && !error.fatal ? errorText(t, error.code, error.reason) : null)} tone={toast ? "info" : "warn"} />

      {board ?? (
        <>
          <div className={`frame status-bar tone-${status.tone}`} data-world="box" data-world-id="status">
            <div className="min-w-0">
              <p className="eyebrow status-text" aria-live="polite">{status.text}</p>
              {opp && !opp.connected && link === "live" && (
                <p className="status-sub">{t("dropped", { name: opp.name })}</p>
              )}
            </div>
            <div className="status-gauges">
              <div className="gauge"><span className="max-sm:hidden">{t("round")}</span><span className="sm:hidden">{t("round_short")}</span><b>{view?.round ?? 1}</b></div>
              {view?.yourSecret && (
                <button type="button" className="gauge lock" aria-pressed={codeShown}
                  aria-label={codeShown ? t("hide_code") : t("show_your_code")} onClick={() => setCodeShown((v) => !v)}>
                  <svg viewBox="0 0 7 8" aria-hidden="true" shapeRendering="crispEdges" fill="var(--brass-4)">
                    {codeShown
                      ? <><rect x="1" y="0" width="3" height="1" /><rect x="0" y="1" width="1" height="2" /><rect x="4" y="1" width="1" height="1" /></>
                      : <><rect x="2" y="0" width="3" height="1" /><rect x="1" y="1" width="1" height="2" /><rect x="5" y="1" width="1" height="2" /></>}
                    <rect x="0" y="3" width="7" height="5" />
                    <rect x="3" y="5" width="1" height="2" fill="var(--ink)" />
                  </svg>
                  <b style={{ color: "var(--brass-4)" }}>{codeShown ? view.yourSecret.join("") : "••••"}</b>
                </button>
              )}
              {opp && (
                <button type="button" className="gauge msg-btn" aria-label={unheard ? t("messages_new") : t("messages")}
                  onClick={() => setChatOpen(true)}>
                  <ChatIcon />
                  {unheard && <span className="tab-dot" />}
                </button>
              )}
              {phase === "over" && reviewing && (
                <button type="button" className="btn" onClick={() => setReviewing(false)}>{t("results")}</button>
              )}
            </div>
          </div>

          <div className="board-tabs lg:hidden" role="tablist" aria-label={t("boards")}>
            {(["mine", "theirs"] as const).map((which) => (
              <button key={which} type="button" role="tab" aria-selected={which === tab}
                className={which === tab ? "btn" : "btn-wood"} onClick={() => setTab(which)}
                data-world="box" data-world-id={`tab-${which}`}>
                <span className="truncate">{which === "mine" ? t("your_hunt") : theirTabLabel}</span>
                {which === "theirs" && unseen && <span className="tab-dot" aria-label="new guess" />}
              </button>
            ))}
          </div>

          <main className="shell-stage stage-room" data-tab={tab}>
            <section className="frame board board-mine" aria-label={t("your_hunt")}>
              <Critters theme={theme} say={unheard && !chatOpen ? unheard : null} onHeard={markRead} />
              <div className="board-log">
                <div className="board-head">
                  <p className="eyebrow">{settingSecret ? t("your_secret") : t("your_hunt")}</p>
                  <p className="eyebrow">{triesText(lang, view?.yourHunt.length ?? 0)}</p>
                </div>

                <Ledger turns={view?.yourHunt ?? []} onLoad={phase === "play" ? draft.load : undefined}
                  label={t("your_guesses")} empty={
                    settingSecret ? <p className="eyebrow">{t("four_digits")}</p>
                    : phase === "setup" ? <p className="eyebrow">{t("locked_in")}</p>
                    : <p className="eyebrow">{t("your_guesses")}</p>
                  } />

                <p className="readout sr-only" aria-live="polite">
                  {lastMine ? verdictText(lang, lastMine.verdict) : status.text}
                </p>
              </div>

              <div className="board-controls">
                <div className="reels-well">
                  <Reels slots={draft.slots} active={draft.slot} locked={!canCompose} onFocusSlot={draft.setSlot} />
                </div>
                <Keypad
                  isBlocked={draft.isBlocked} ruledOut={ruledOut} disabled={!canCompose}
                  canErase={draft.used.length > 0} canSubmit={canFire}
                  submitLabel={pending ? t("sending") : settingSecret ? t("lock_in") : myTurn || phase !== "play" ? t("fire") : t("their_turn")}
                  onPlace={draft.place} onErase={draft.clear} onSubmit={submit}
                />
              </div>
            </section>

            <section className="frame board board-theirs" aria-label={theirTabLabel}>
              <div className="board-log">
                <div className="board-head">
                  <p className="eyebrow truncate">{theirTabLabel}</p>
                  <p className="eyebrow shrink-0">{triesText(lang, theirCount)}</p>
                </div>

                <Ledger turns={view?.theirHunt ?? []} theirs label={theirTabLabel}
                  empty={<p className="eyebrow">{t("their_guesses")}</p>} />

                <p className="readout sr-only" aria-live="polite">
                  {lastTheirs
                    ? t("they_guessed", { code: lastTheirs.guess.join(""), verdict: verdictText(lang, lastTheirs.verdict) })
                    : t("nothing_yet")}
                </p>
              </div>

              <div className="board-controls">
                <div className="inset p-3">
                  <p className="eyebrow mb-2.5">{t("closest")}</p>
                  <div className="flex items-center gap-3" style={{ fontSize: 14 }}>
                    {theirCount ? (
                      <>
                        <BarMarks verdict={threat} animate={false} />
                        <span>{verdictText(lang, threat)}</span>
                      </>
                    ) : (
                      <span className="muted">{t("nothing_yet")}</span>
                    )}
                  </div>
                </div>
                <div className="parchment p-3">
                  <p className="eyebrow on-paper mb-2">{t("your_notes")}</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
                      <button key={d} type="button" className="note" aria-pressed={Boolean(ruledOut[d])}
                        aria-label={t("rule_out", { d })} onClick={() => setRuledOut((p) => ({ ...p, [d]: !p[d] }))}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </>
      )}

      <Modal open={chatOpen && Boolean(opp)} onClose={() => setChatOpen(false)} labelledBy="chat-title">
        <p className="eyebrow mb-3" id="chat-title">{t("messages")}</p>
        {chatPanel}
        <button type="button" className="btn-wood mt-4 w-full" onClick={() => setChatOpen(false)}>{t("close")}</button>
      </Modal>

      <Modal open={Boolean(view && phase === "over" && !reviewing)} tone="result" labelledBy="over-title"
        onClose={() => setReviewing(true)}>
        {view && <ResultCard view={view} theme={theme} onRematch={r.rematch} onReview={() => setReviewing(true)} onLeave={r.leave} />}
      </Modal>
    </div>
  );
}

function ResultCard({ view, theme, onRematch, onReview, onLeave }: {
  view: RoomView; theme: Theme; onRematch: () => void; onReview: () => void; onLeave: () => void;
}) {
  const t = useT();
  const them = view.opponent?.name ?? t("rival_cap");
  const theirCode = view.revealedSecrets ? (view.seat === "host" ? view.revealedSecrets.guest : view.revealedSecrets.host) : null;
  const you = view.you;
  const opp = view.opponent;

  const rematchLabel = you.wantsRematch
    ? t("st_waiting", { name: them })
    : opp?.wantsRematch
      ? t("rematch_in", { name: them })
      : t("rematch");

  return (
    <div className="relative text-center">
      {view.outcome === "win" && <Cheer theme={theme} />}
      <h2 className="title mb-3" style={{ fontSize: 19 }} id="over-title">
        {view.outcome === "win" ? t("you_win") : t("name_wins", { name: them })}
      </h2>
      <p className="copy" style={{ color: "var(--paper-4)" }}>
        {view.outcome === "win"
          ? t("you_cracked", { n: view.round })
          : t("they_cracked", { name: them, n: view.round })}
      </p>

      {theirCode && (
        <>
          <p className="copy mt-4" style={{ fontSize: 15, color: "var(--paper-3)" }}>{t("their_code_was")}</p>
          <div className="my-3 flex justify-center gap-2">
            {theirCode.map((d, i) => <span key={i} className="digit is-gold">{d}</span>)}
          </div>
        </>
      )}

      {opp && !opp.connected && <p className="status-sub mb-3">{t("dropped_short", { name: opp.name })}</p>}

      <button type="button" className={`btn btn-big w-full ${opp?.wantsRematch && !you.wantsRematch ? "is-pulse" : ""}`}
        disabled={you.wantsRematch} onClick={onRematch} autoFocus>
        {rematchLabel}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" className="btn-wood" onClick={onReview}>{t("see_boards")}</button>
        <QuitButton label={t("menu")} confirm={false} onLeave={onLeave} />
      </div>
    </div>
  );
}

function FatalPanel({ error, onRetry }: { error: RoomError; onRetry: (reopen?: boolean) => void }) {
  const nav = useNavigate();
  const t = useT();
  const copy: Record<string, { title: Key; body: Key; action?: [Key, () => void] }> = {
    no_room: { title: "fatal_no_room_t", body: "fatal_no_room_b", action: ["fatal_no_room_a", () => onRetry(true)] },
    room_full: { title: "fatal_full_t", body: "fatal_full_b" },
    replaced: { title: "fatal_replaced_t", body: "fatal_replaced_b", action: ["fatal_replaced_a", () => onRetry()] },
    version: { title: "fatal_version_t", body: "fatal_version_b", action: ["fatal_version_a", () => window.location.reload()] },
    busy: { title: "fatal_busy_t", body: "fatal_busy_b", action: ["try_again", () => onRetry()] },
    bad_room: { title: "fatal_bad_room_t", body: "fatal_bad_room_b" },
  };
  const c = copy[error.code];
  const action = c ? c.action : (["try_again", () => onRetry()] as [Key, () => void]);
  return (
    <div className="frame panel text-center" role="alert">
      <h2 className="title mb-3" style={{ fontSize: 16 }}>{t(c?.title ?? "fatal_other_t")}</h2>
      <p className="copy muted mb-5">{c ? t(c.body) : error.reason}</p>
      <div className="grid gap-2.5">
        {action && <button type="button" className="btn btn-big w-full" onClick={action[1]}>{t(action[0])}</button>}
        <button type="button" className={action ? "btn-wood w-full" : "btn btn-big w-full"} onClick={() => nav("/")}>{t("back_to_menu")}</button>
      </div>
    </div>
  );
}
