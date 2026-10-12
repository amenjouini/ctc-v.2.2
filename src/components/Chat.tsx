import { useEffect, useRef, useState } from "react";
import { CHAT_MAX, type ChatLine } from "@shared/protocol";
import { useT } from "@/i18n";

/**
 * Table talk: everything said so far, and a box to say something. The same
 * panel is used from the message button on the board and inside the menu,
 * so the conversation is always reachable — with characters on or off.
 */
export function ChatPanel({
  lines, them, onSend, onSeen,
}: {
  lines: ChatLine[];
  them: string;
  /** returns false when the message could not be sent (offline) */
  onSend: (text: string) => boolean;
  /** the panel is showing these lines: nothing here is unread any more */
  onSeen?: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onSeen?.();
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    // only when a new line arrives, not on every render of the parent
  }, [lines.length]);

  const send = () => {
    const text = draft.trim();
    if (text && onSend(text)) setDraft("");
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={list} role="log" aria-label={t("messages_with", { name: them })}>
        {lines.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>{t("no_messages")}</p>
        ) : (
          lines.map((l) => (
            <p key={l.id} className={`chat-line ${l.mine ? "mine" : ""}`}>
              <span className="sr-only">{l.mine ? t("you_said") : `${them}: `}</span>
              {l.text}
            </p>
          ))
        )}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="field field-text min-w-0 flex-1" value={draft} maxLength={CHAT_MAX}
          placeholder={t("say_to", { name: them })} aria-label={t("message")} enterKeyHint="send" autoComplete="off"
          onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn" disabled={!draft.trim()}>{t("send")}</button>
      </form>
    </div>
  );
}

/** A pixel speech bubble, for the message button. */
export function ChatIcon() {
  return (
    <svg viewBox="0 0 9 8" aria-hidden="true" shapeRendering="crispEdges" fill="currentColor">
      <rect x="1" y="0" width="7" height="1" />
      <rect x="0" y="1" width="9" height="4" />
      <rect x="1" y="5" width="7" height="1" />
      <rect x="2" y="6" width="2" height="1" />
      <rect x="2" y="7" width="1" height="1" />
    </svg>
  );
}
