import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROOM_CODE_LENGTH, isRoomCode, makeRoomCode, normaliseRoom } from "@shared/engine";
import { NAME_MAX } from "@shared/protocol";
import { Masthead } from "@/components/Chrome";
import { readName, saveName } from "@/hooks/usePlayerName";
import type { Theme } from "@/hooks/useTheme";
import { useT } from "@/i18n";

export function Home({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const nav = useNavigate();
  const t = useT();
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
    if (c.length < ROOM_CODE_LENGTH) return setJoinError(t("err_code_short"));
    if (!isRoomCode(c)) return setJoinError(t("err_code_bad"));
    nav(`/room/${c}`);
  };

  return (
    <div className="shell relative mx-auto w-full max-w-[520px]">
      <Masthead theme={theme} setTheme={setTheme} />

      <div className="shell-scroll">
        <div className="frame home p-4 sm:p-6">
          <button type="button" className="btn btn-hero w-full" onClick={() => nav("/solo")}>{t("play_solo")}</button>

          <div className="inset mt-4 p-4">
            <p className="eyebrow mb-3">{t("play_friend")}</p>
            <label className="field-label" htmlFor="player-name">{t("your_name")}</label>
            <input id="player-name" className="field field-text mb-3 w-full"
              maxLength={NAME_MAX} autoComplete="nickname" enterKeyHint="done"
              value={name} onChange={(e) => remember(e.target.value)} />
            <button type="button" className="btn-wood mb-4 w-full" onClick={host}>{t("create_table")}</button>
            <label className="field-label" htmlFor="join-code">{t("join_with_code")}</label>
            <div className="flex gap-2">
              <input id="join-code" className="field min-w-0 flex-1" placeholder={t("code_placeholder")} maxLength={ROOM_CODE_LENGTH}
                autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="go"
                aria-invalid={Boolean(joinError)} aria-describedby={joinError ? "join-error" : undefined}
                value={join} onChange={(e) => { setJoin(normaliseRoom(e.target.value)); setJoinError(null); }}
                onKeyDown={(e) => e.key === "Enter" && enter()} />
              <button type="button" className="btn-wood" onClick={enter} disabled={join.length === 0}>{t("join")}</button>
            </div>
            {joinError && <p id="join-error" className="field-error mt-2" role="alert">{joinError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
