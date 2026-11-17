/**
 * The app page, with its link-preview tags filled in for the address it is
 * served at. Chat apps read these to draw the card under a pasted link, and
 * they need absolute URLs, which only the server knows (the same build runs
 * on any domain).
 */
import { isRoomCode } from "../shared/engine";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function preview(pathname: string): { title: string; desc: string; path: string } {
  const room = /^\/room\/([^/]+)\/?$/.exec(pathname)?.[1]?.toUpperCase();
  if (room && isRoomCode(room)) {
    return {
      title: `Join my table: ${room}`,
      desc: "You have been challenged to Crack the Code. Open the link to take a seat and set your secret code.",
      path: `/room/${room}`,
    };
  }
  if (pathname === "/daily") {
    return {
      title: "Crack the Code: the daily puzzle",
      desc: "The same four-digit code for everyone today. How few tries will you need?",
      path: "/daily",
    };
  }
  return {
    title: "Crack the Code",
    desc: "Crack a hidden four-digit code in as few tries as you can: solo, the daily puzzle, or head to head with a friend.",
    path: "/",
  };
}

/** `origin` must already be checked (scheme://host, nothing else). */
export function renderPage(html: string, origin: string, pathname: string): string {
  const p = preview(pathname);
  return html
    .replaceAll("__ORIGIN__", escape(origin))
    .replaceAll("__OG_PATH__", escape(p.path))
    .replaceAll("__OG_TITLE__", escape(p.title))
    .replaceAll("__OG_DESC__", escape(p.desc));
}

/** The public origin of a request, or null when the host looks wrong. */
export function originOf(host: string | undefined, https: boolean): string | null {
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return null;
  return `${https ? "https" : "http"}://${host.toLowerCase()}`;
}
