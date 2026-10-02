import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { describe, isRoomCode, makeRoomCode, normaliseRoom, spell, type Code, type Verdict } from "@shared/engine";
import { NAME_MAX, cleanName, type RoomView } from "@shared/protocol";
import { BarMarks } from "@/components/BarMarks";
import { Critters } from "@/components/Critters";
import { Ledger } from "@/components/GuessRow";
import { Keypad } from "@/components/Keypad";
import { Masthead, RoomBadge, Toast } from "@/components/Chrome";
import { Modal, QuitButton, RailCards } from "@/components/Rail";
import { Reels } from "@/components/Reels";
import { useDraft, useGameKeys } from "@/hooks/useDraft";
import { readName, saveName } from "@/hooks/usePlayerName";
import { hasSeat, useRoom, type RoomError } from "@/hooks/useRoom";
import type { Theme } from "@/hooks/useTheme";

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

/** Spelled out, like every verdict — a figure beside a code reads as a digit. */
function threatText(v: Verdict): string {
  const exact = v.exact === 0 ? "None" : spell(v.exact);
  return v.misplaced > 0
    ? `${exact} in the right slot, ${spell(v.misplaced).toLowerCase()} elsewhere.`
    : `${exact} in the right slot.`;
}

function statusLine(view: RoomView | null, link: string): { text: string; tone: "turn" | "wait" | "alert" } {
  if (link === "lost") return { text: "Connection lost — reconnecting…", tone: "alert" };
  if (!view) return { text: "Finding the table…", tone: "wait" };
  const them = view.opponent?.name ?? "your rival";
  switch (view.phase) {
    case "lobby":
      return { text: "Waiting for a rival to join…", tone: "wait" };
    case "setup":
      if (!view.you.ready) return { text: `Set a secret code for ${them} to crack`, tone: "turn" };
      return { text: `Locked in. Waiting for ${them}…`, tone: "wait" };
    case "play":
      return view.turn === view.seat
        ? { text: "Your turn — fire a guess", tone: "turn" }
        : { text: `${them} is guessing…`, tone: "wait" };
    case "over":
      return { text: "Match over", tone: "wait" };
  }
}

export function Room({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const { code = "" } = useParams();
  const room = normaliseRoom(code);
  const validRoom = isRoomCode(room);
  const nav = useNavigate();
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
  const [guide, setGuide] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ruledOut, setRuledOut] = useState<Record<string, boolean>>({});
  const [seenTheirs, setSeenTheirs] = useState(0);

  const phase = view?.phase ?? "lobby";
  const opp = view?.opponent ?? null;
  const them = opp?.name ?? "your rival";
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
      setNotice(`${lastOpp.current} left the table.`);
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
    const t = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share);
      setToast("Link copied");
    } catch {
      setToast("Copy the link from the box below");
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const nativeShare = () =>
    navigator.share({ title: "Crack the Code", text: `Join my table: ${room}`, url: share }).catch(() => undefined);

  const takeSeat = () => {
    if (!cleanName(name)) return;
    saveName(name);
    setSeated(true);
  };

  const status = statusLine(view, link);
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
          <p className="eyebrow mb-2">Table {room}</p>
          <h2 className="title mb-3" style={{ fontSize: 16 }}>Take a seat</h2>
          <p className="copy muted mb-4">Pick the name your rival will see.</p>
          <form onSubmit={(e) => { e.preventDefault(); takeSeat(); }}>
            <label className="field-label" htmlFor="seat-name">Your name</label>
            <input id="seat-name" className="field field-text mb-3 w-full" maxLength={NAME_MAX} autoFocus
              autoComplete="nickname" enterKeyHint="go" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-big w-full" disabled={!cleanName(name)}>Sit down</button>
          </form>
        </div>
      );
    }
    if (!view) {
      return (
        <div className="frame panel text-center" aria-busy="true">
          <p className="eyebrow mb-3">Table {room}</p>
          <p className="loading-dots" aria-hidden="true"><i /><i /><i /></p>
          <p className="copy muted mt-3">{link === "lost" ? "The server is not answering. Still trying…" : "Finding the table…"}</p>
        </div>
      );
    }
    if (phase === "lobby") {
      return (
        <div className="frame panel text-center">
          {notice && <p className="notice mb-4">{notice} The table is open for someone new.</p>}
          <p className="eyebrow mb-3">Share this code with your friend</p>
          <p className="title room-code mb-4">{room}</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-big" onClick={copy}>Copy link</button>
            {canShare
              ? <button type="button" className="btn-wood" onClick={nativeShare}>Share&hellip;</button>
              : <input className="field field-text w-full" readOnly value={share} aria-label="Table link"
                  onFocus={(e) => e.currentTarget.select()} />}
          </div>
          <p className="copy muted" style={{ fontSize: 14 }}>
            They can open the link, or type <b className="text-[var(--paper-5)]">{room}</b> on the front page.
            You are playing as <b className="text-[var(--paper-5)]">{view.you.name}</b>.
          </p>
        </div>
      );
    }
    return null;
  })();

  const theirTabLabel = opp ? `${opp.name}’s hunt` : "Their hunt";

  return (
    <div className="shell relative mx-auto w-full max-w-[1160px]">
      <Masthead theme={theme} setTheme={setTheme} right={
        <>
          <RoomBadge code={room} link={fatal ? "closed" : link} />
          {!board && <button type="button" className="btn-wood lg:hidden" data-world="box" data-world-id="guide" onClick={() => setGuide(true)}>Guide</button>}
          <QuitButton worldBox confirm={inMatch} onLeave={r.leave}
            warning={`You will give up your seat, and ${them} will be left waiting at the table.`} />
        </>
      } />

      <Toast message={toast ?? (error && !error.fatal ? error.reason : null)} tone={toast ? "info" : "warn"} />

      {board ?? (
        <>
          <div className={`frame status-bar tone-${status.tone}`} data-world="box" data-world-id="status">
            <div className="min-w-0">
              <p className="eyebrow status-text" aria-live="polite">{status.text}</p>
              {opp && !opp.connected && link === "live" && (
                <p className="status-sub">{opp.name} dropped out. Holding their seat for a few minutes.</p>
              )}
            </div>
            <div className="status-gauges">
              <div className="gauge"><span>Round</span><b>{view?.round ?? 1}</b></div>
              {view?.yourSecret && (
                <div className="gauge"><span className="gauge-long">Your code</span><span className="gauge-short">Code</span><b style={{ color: "var(--brass-4)" }}>{view.yourSecret.join("")}</b></div>
              )}
              {phase === "over" && reviewing && (
                <button type="button" className="btn" onClick={() => setReviewing(false)}>Results</button>
              )}
            </div>
          </div>

          <div className="board-tabs lg:hidden" role="tablist" aria-label="Boards">
            {(["mine", "theirs"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={t === tab}
                className={t === tab ? "btn" : "btn-wood"} onClick={() => setTab(t)}
                data-world="box" data-world-id={`tab-${t}`}>
                <span className="truncate">{t === "mine" ? "Your hunt" : theirTabLabel}</span>
                {t === "theirs" && unseen && <span className="tab-dot" aria-label="new guess" />}
              </button>
            ))}
          </div>

          <main className="shell-stage stage-room" data-tab={tab}>
            <section className="frame board board-mine" aria-label="Your hunt">
              <Critters theme={theme} />
              <div className="board-log">
                <div className="board-head">
                  <p className="eyebrow">{settingSecret ? "Your secret" : "Your hunt for their code"}</p>
                  <p className="eyebrow">{view?.yourHunt.length ?? 0} sent</p>
                </div>

                <Ledger turns={view?.yourHunt ?? []} onLoad={phase === "play" ? draft.load : undefined}
                  label="Your guesses" empty={
                    settingSecret ? <p>Choose four different digits for <b className="text-[var(--paper-4)]">{them}</b> to crack.<br />It cannot start with zero.</p>
                    : phase === "setup" ? <p>Your code is locked in.<br />Your guesses at theirs will land here.</p>
                    : <p>Your guesses at their secret<br />will appear here.</p>
                  } />

                <p className="parchment readout" aria-live="polite">
                  {lastMine ? describe(lastMine.verdict)
                    : settingSecret ? "Only the server ever sees your secret."
                    : myTurn ? "You open this round. Make it count."
                    : phase === "play" ? "Line up your first guess while you wait."
                    : "Waiting for both codes."}
                </p>
              </div>

              <div className="board-controls">
                <div className="inset reels-well">
                  <Reels slots={draft.slots} active={draft.slot} locked={!canCompose} onFocusSlot={draft.setSlot} />
                </div>
                <Keypad
                  isBlocked={draft.isBlocked} ruledOut={ruledOut} disabled={!canCompose}
                  canErase={draft.used.length > 0} canSubmit={canFire}
                  submitLabel={pending ? "Sending…" : settingSecret ? "Lock it in" : myTurn || phase !== "play" ? "Fire" : "Their turn"}
                  onPlace={draft.place} onErase={draft.clear} onSubmit={submit}
                />
              </div>
            </section>

            <section className="frame board board-theirs" aria-label={theirTabLabel}>
              <div className="board-log">
                <div className="board-head">
                  <p className="eyebrow truncate">{opp ? `${opp.name}’s hunt for your code` : "Their hunt for your code"}</p>
                  <p className="eyebrow shrink-0">{theirCount} sent</p>
                </div>

                <Ledger turns={view?.theirHunt ?? []} theirs label={theirTabLabel}
                  empty={<p>Their guesses at your secret<br />will appear here.</p>} />

                <p className="parchment readout" aria-live="polite">
                  {lastTheirs
                    ? `They guessed ${lastTheirs.guess.join("")}. ${describe(lastTheirs.verdict)}`
                    : "Nothing yet."}
                </p>
              </div>

              <div className="board-controls">
                <div className="inset p-3">
                  <p className="eyebrow mb-2.5">Closest they have come</p>
                  <div className="flex items-center gap-3" style={{ fontSize: 14 }}>
                    {theirCount ? (
                      <>
                        <BarMarks verdict={threat} animate={false} />
                        <span>{threatText(threat)}</span>
                      </>
                    ) : (
                      <span className="muted">Nothing yet.</span>
                    )}
                  </div>
                </div>
                <div className="parchment p-3">
                  <p className="eyebrow on-paper mb-2">Your notes</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
                      <button key={d} type="button" className="note" aria-pressed={Boolean(ruledOut[d])}
                        aria-label={`Rule out ${d}`} onClick={() => setRuledOut((p) => ({ ...p, [d]: !p[d] }))}>
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

      <Modal open={guide} onClose={() => setGuide(false)} labelledBy="guide-title">
        <RailCards inModal ruledOut={ruledOut} onToggle={(d) => setRuledOut((p) => ({ ...p, [d]: !p[d] }))} />
        <button type="button" className="btn mt-5 w-full" onClick={() => setGuide(false)}>Close</button>
      </Modal>

      <Modal open={Boolean(view && phase === "over" && !reviewing)} tone="result" labelledBy="over-title"
        onClose={() => setReviewing(true)}>
        {view && <ResultCard view={view} onRematch={r.rematch} onReview={() => setReviewing(true)} onLeave={r.leave} />}
      </Modal>
    </div>
  );
}

function ResultCard({ view, onRematch, onReview, onLeave }: {
  view: RoomView; onRematch: () => void; onReview: () => void; onLeave: () => void;
}) {
  const them = view.opponent?.name ?? "Your rival";
  const theirCode = view.revealedSecrets ? (view.seat === "host" ? view.revealedSecrets.guest : view.revealedSecrets.host) : null;
  const you = view.you;
  const opp = view.opponent;

  const rematchLabel = you.wantsRematch
    ? `Waiting for ${them}…`
    : opp?.wantsRematch
      ? `Rematch — ${them} is in`
      : "Rematch";

  return (
    <div className="text-center">
      <h2 className="title mb-3" style={{ fontSize: 19 }} id="over-title">
        {view.outcome === "win" ? "You win" : view.outcome === "loss" ? `${them} wins` : "Dead heat"}
      </h2>
      <p className="copy" style={{ color: "var(--paper-4)" }}>
        {view.outcome === "draw"
          ? `You both cracked it in round ${view.round}.`
          : view.outcome === "win"
            ? `You cracked it in round ${view.round}.`
            : `${them} cracked yours in round ${view.round}.`}
      </p>

      {theirCode && (
        <>
          <p className="copy mt-4" style={{ fontSize: 15, color: "var(--paper-3)" }}>Their code was</p>
          <div className="my-3 flex justify-center gap-2">
            {theirCode.map((d, i) => <span key={i} className="digit is-gold">{d}</span>)}
          </div>
        </>
      )}

      {opp && !opp.connected && <p className="status-sub mb-3">{opp.name} has dropped out for now.</p>}

      <button type="button" className={`btn btn-big w-full ${opp?.wantsRematch && !you.wantsRematch ? "is-pulse" : ""}`}
        disabled={you.wantsRematch} onClick={onRematch} autoFocus>
        {rematchLabel}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button type="button" className="btn-wood" onClick={onReview}>See the boards</button>
        <QuitButton label="Menu" confirm={false} onLeave={onLeave} />
      </div>
    </div>
  );
}

function FatalPanel({ error, onRetry }: { error: RoomError; onRetry: (reopen?: boolean) => void }) {
  const nav = useNavigate();
  const copy: Record<string, { title: string; body: string; action?: [string, () => void] }> = {
    no_room: {
      title: "This table is closed",
      body: "The code may be mistyped, or the table closed after everyone left. You can open it again and share the link.",
      action: ["Open this table", () => onRetry(true)],
    },
    room_full: { title: "This table is full", body: "Two players are already seated. Ask for a new link, or start your own table." },
    replaced: {
      title: "Open somewhere else",
      body: "This seat was picked up in another tab or window.",
      action: ["Play here instead", () => onRetry()],
    },
    version: {
      title: "The game was updated",
      body: "Refresh to get the new version. Your seat is kept.",
      action: ["Refresh", () => window.location.reload()],
    },
    busy: { title: "The server is busy", body: error.reason, action: ["Try again", () => onRetry()] },
    bad_room: { title: "Not a table code", body: "Table codes are five letters and numbers. Check the link and try again." },
  };
  const c = copy[error.code] ?? { title: "Something went wrong", body: error.reason, action: ["Try again", () => onRetry()] };
  return (
    <div className="frame panel text-center" role="alert">
      <h2 className="title mb-3" style={{ fontSize: 16 }}>{c.title}</h2>
      <p className="copy muted mb-5">{c.body}</p>
      <div className="grid gap-2.5">
        {c.action && <button type="button" className="btn btn-big w-full" onClick={c.action[1]}>{c.action[0]}</button>}
        <button type="button" className={c.action ? "btn-wood w-full" : "btn btn-big w-full"} onClick={() => nav("/")}>Back to the menu</button>
      </div>
    </div>
  );
}
