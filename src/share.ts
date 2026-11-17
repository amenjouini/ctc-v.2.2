/**
 * Sharing a result or a link: the phone's own share sheet where there is
 * one, otherwise the clipboard. Returns what happened so the page can say so.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareText(text: string, title?: string): Promise<ShareOutcome> {
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  // Desktop browsers with a share sheet tend to bury it; copying is what
  // people expect there.
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ text, title });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return copyFallback(text) ? "copied" : "failed";
  }
}

/** Older browsers and non-secure pages: the textarea trick. */
function copyFallback(text: string): boolean {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}
