import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROOM_CODE_LENGTH, isRoomCode, makeRoomCode, normaliseRoom } from "@shared/engine";
import { NAME_MAX } from "@shared/protocol";
import { Masthead } from "@/components/Chrome";
import { BarLegend } from "@/components/Rail";
import { readName, saveName } from "@/hooks/usePlayerName";
import type { Theme } from "@/hooks/useTheme";

export function Home({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const nav = useNavigate();
  const [join, setJoin] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [name, setName] = useState(readName);

  const remember = (v: string) => {
    setName(v);
    saveName(v);
  };

  const host = () => nav(`/room/${makeRoomCode()}`, { state: { create: true } });
  const enter = () => {
    const c = normaliseRoom(join);
    if (c.length < ROOM_CODE_LENGTH) return setJoinError("Table codes are five characters.");
    if (!isRoomCode(c)) return setJoinError("That is not a table code. Codes never use 0, 1, I, L or O.");
    nav(`/room/${c}`);
  };

  return (
    <div className="shell relative mx-auto w-full max-w-[860px]">
      <Masthead theme={theme} setTheme={setTheme} />

      <div className="shell-scroll">
        <div className="frame home p-4 sm:p-6">
          <p className="eyebrow mb-2">Choose a table</p>
          <p className="copy mb-4" style={{ color: "var(--paper-3)" }}>
            A hidden code of four different digits, never starting with zero.
            Crack it in as few tries as you can.
          </p>

          <div className="home-grid">
            <div className="inset flex flex-col p-4">
              <p className="eyebrow mb-2">On your own</p>
              <p className="copy muted mb-3">Endless codes. Beat your own best.</p>
              <ul className="steps muted">
                <li>Enter four different digits.</li>
                <li>Every guess earns four bars.</li>
                <li>Read them, rule digits out, close in.</li>
              </ul>
              <button type="button" className="btn btn-big mt-auto w-full" onClick={() => nav("/solo")}>Play solo</button>
            </div>

            <div className="inset p-4">
              <p className="eyebrow mb-2">Against a friend</p>
              <p className="copy muted mb-3">
                You each set a secret, then take turns cracking each other&rsquo;s.
              </p>
              <label className="field-label" htmlFor="player-name">Your name</label>
              <input id="player-name" className="field field-text mb-2 w-full" placeholder="Shown to your rival"
                maxLength={NAME_MAX} autoComplete="nickname" enterKeyHint="done"
                value={name} onChange={(e) => remember(e.target.value)} />
              <button type="button" className="btn mb-3 w-full" onClick={host}>Create a table</button>
              <label className="field-label" htmlFor="join-code">Or join one</label>
              <div className="flex gap-2">
                <input id="join-code" className="field min-w-0 flex-1" placeholder="CODE" maxLength={ROOM_CODE_LENGTH}
                  autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="go"
                  aria-invalid={Boolean(joinError)} aria-describedby={joinError ? "join-error" : undefined}
                  value={join} onChange={(e) => { setJoin(normaliseRoom(e.target.value)); setJoinError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && enter()} />
                <button type="button" className="btn-wood" onClick={enter} disabled={join.length === 0}>Join</button>
              </div>
              {joinError && <p id="join-error" className="field-error mt-2" role="alert">{joinError}</p>}
            </div>
          </div>

          <div className="parchment mt-3 p-4">
            <p className="eyebrow on-paper mb-3">How a guess is scored</p>
            <BarLegend onPaper />
            <p className="copy mt-3" style={{ fontSize: 14 }}>
              Every guess gets four bars. They are a <b>tally</b>, not a map &mdash; where a bar sits
              says nothing about which digit it means.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
