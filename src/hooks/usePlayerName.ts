import { cleanName } from "@shared/protocol";

const NAME_KEY = "ctc.name";

/** The name shown to a rival. Stored per device; the server re-cleans it. */
export function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(raw: string) {
  try {
    localStorage.setItem(NAME_KEY, raw);
  } catch {
    /* private mode */
  }
}

export function displayName(raw: string): string {
  return cleanName(raw);
}
