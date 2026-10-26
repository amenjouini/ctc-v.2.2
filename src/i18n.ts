import { useCallback } from "react";
import { CODE_LENGTH, type Verdict } from "@shared/engine";
import type { ErrorCode } from "@shared/protocol";
import { useSettings } from "@/hooks/useSettings";

/**
 * Every word the player reads, in every language the game speaks.
 *
 * English is the source: its keys are the type, so a missing or misspelt
 * key in another language is a compile error. `{name}`-style holes are
 * filled by t(). Adding a language is adding one more object here (and,
 * for a right-to-left one, a `dir` — the layout already uses logical
 * spacing where it matters).
 */
export const LANGS = { en: "English", fr: "Français" } as const;
export type Lang = keyof typeof LANGS;

const en = {
  // front door
  play_solo: "Play solo",
  play_friend: "Play a friend",
  your_name: "Your name",
  create_table: "Create a table",
  join_with_code: "Join with a code",
  join: "Join",
  code_placeholder: "CODE",
  err_code_short: "Table codes are five characters.",
  err_code_bad: "That is not a table code. Codes never use 0, 1, I, L or O.",

  // shared board
  your_guesses: "Your guesses",
  four_digits: "Four different digits",
  tries_one: "{n} try",
  tries_other: "{n} tries",
  tries: "Tries",
  best: "Best",
  erase: "Erase",
  keypad: "Keypad",
  key_ruled_out: "{d}, ruled out in your notes",
  slot_empty: "Slot {n}, empty",
  slot_filled: "Slot {n}, {d}",
  reels: "Your guess, four digits",
  try_label: "Try {n}: {guess}. {verdict}",
  reuse: "Press to reuse these digits.",
  reuse_short: "Reuse these digits",

  // solo
  crack_it: "Crack it",
  new_code: "New code",
  quit: "Quit",
  show_code: "Show the code",
  show_code_left: "Show the code ({n} left today)",
  code_shown: "Code shown",
  no_reveals: "No reveals left today",
  reveals_left: "{n} of {max} reveals left today",
  revealed_readout: "The code is {code}. This round will not count towards your best.",
  this_game: "This game",
  your_board: "Your board",
  next_code: "Next code",
  cracked: "Cracked it",
  new_best: "New best",
  code_was: "{tries}. The code was:",
  revealed_note: "Revealed round — not counted.",
  see_board: "See the board",
  menu: "Menu",
  new_q: "Start a new code?",
  new_warning: "This board will be thrown away. It will not count against your best.",
  keep_this: "Keep this one",
  saved_warning: "Your board is saved on this device, so you can pick it up again later.",

  // leaving
  leave_q: "Leave the table?",
  leave_default: "Your current board will be lost.",
  keep_playing: "Keep playing",
  leave: "Leave",
  leave_table: "Leave the table",
  leave_warning: "You will give up your seat, and {name} will be left waiting at the table.",

  // menu
  how_to_play: "How to play",
  how_rule: "Find the hidden code: four different digits, never starting with 0.",
  how_bars: "The bars count. They never point at a digit.",
  legend_exact: "Right digit, right slot",
  legend_near: "Right digit, wrong slot",
  legend_absent: "None of them in the code",
  ruled_out: "Ruled out",
  rule_out: "Rule out {d}",
  hold_tip: "Tip: hold a key on the keypad to rule it out.",
  scene: "Scene",
  theme_dusk: "Dusk",
  theme_beach: "Beach",
  theme_snow: "Snow",
  theme_autumn: "Autumn",
  settings: "Settings",
  characters: "Characters",
  language: "Language",
  close: "Close",

  // online
  rival: "your rival",
  rival_cap: "Your rival",
  st_lost: "Connection lost — reconnecting…",
  st_finding: "Finding the table…",
  st_lobby: "Waiting for a rival to join…",
  st_set: "Set your secret code",
  st_waiting: "Waiting for {name}…",
  st_your_turn: "Your turn",
  st_their_turn: "{name}’s turn",
  st_over: "Match over",
  dropped: "{name} dropped out. Holding their seat for a few minutes.",
  dropped_short: "{name} has dropped out for now.",
  left_notice: "{name} left the table. The table is open for someone new.",
  link_copied: "Link copied",
  link_manual: "Copy the link from the box below",
  share_text: "Join my table: {code}",
  table: "Table",
  table_n: "Table {code}",
  table_link: "Table link",
  take_seat: "Take a seat",
  pick_name: "Pick the name your rival will see.",
  sit_down: "Sit down",
  server_silent: "The server is not answering. Still trying…",
  share_code: "Share this code with your friend",
  copy_link: "Copy link",
  share: "Share…",
  lobby_hint: "They can open the link, or type {code} on the front page. You are playing as {name}.",
  round: "Round",
  round_short: "Rd",
  hide_code: "Hide your code",
  show_your_code: "Show your code",
  results: "Results",
  boards: "Boards",
  your_hunt: "Your hunt",
  their_hunt: "Their hunt",
  name_hunt: "{name}’s hunt",
  your_secret: "Your secret",
  locked_in: "Locked in",
  their_guesses: "Their guesses",
  they_guessed: "They guessed {code}. {verdict}",
  nothing_yet: "Nothing yet.",
  closest: "Closest they have come",
  your_notes: "Your notes",
  fire: "Fire",
  lock_in: "Lock it in",
  their_turn: "Their turn",
  sending: "Sending…",
  rematch: "Rematch",
  rematch_in: "Rematch — {name} is in",
  you_win: "You win",
  name_wins: "{name} wins",
  you_cracked: "You cracked it in round {n}.",
  they_cracked: "{name} cracked yours in round {n}.",
  their_code_was: "Their code was",
  see_boards: "See the boards",

  // messages
  messages: "Messages",
  messages_new: "Messages, new message",
  messages_with: "Messages with {name}",
  no_messages: "No messages yet.",
  say_to: "Say something to {name}",
  message: "Message",
  send: "Send",
  you_said: "You: ",
  bubble_label: "Message: {text}. Tap to dismiss.",

  // dead ends
  fatal_no_room_t: "This table is closed",
  fatal_no_room_b: "The code may be mistyped, or the table closed after everyone left. You can open it again and share the link.",
  fatal_no_room_a: "Open this table",
  fatal_full_t: "This table is full",
  fatal_full_b: "Two players are already seated. Ask for a new link, or start your own table.",
  fatal_replaced_t: "Open somewhere else",
  fatal_replaced_b: "This seat was picked up in another tab or window.",
  fatal_replaced_a: "Play here instead",
  fatal_version_t: "The game was updated",
  fatal_version_b: "Refresh to get the new version. Your seat is kept.",
  fatal_version_a: "Refresh",
  fatal_busy_t: "The server is busy",
  fatal_busy_b: "Try again in a moment.",
  fatal_bad_room_t: "Not a table code",
  fatal_bad_room_b: "Table codes are five letters and numbers. Check the link and try again.",
  fatal_other_t: "Something went wrong",
  try_again: "Try again",
  back_to_menu: "Back to the menu",

  // refusals from the server
  e_bad_code: "That is not a legal code.",
  e_not_now: "Not right now.",
  e_rate_limited: "Slow down a little.",
  e_bad_message: "That did not go through.",
} as const;

export type Key = keyof typeof en;

const fr: Record<Key, string> = {
  play_solo: "Jouer en solo",
  play_friend: "Jouer contre un ami",
  your_name: "Ton nom",
  create_table: "Créer une table",
  join_with_code: "Rejoindre avec un code",
  join: "Rejoindre",
  code_placeholder: "CODE",
  err_code_short: "Un code de table fait cinq caractères.",
  err_code_bad: "Ce n’est pas un code de table. Les codes n’utilisent jamais 0, 1, I, L ni O.",

  your_guesses: "Tes essais",
  four_digits: "Quatre chiffres différents",
  tries_one: "{n} essai",
  tries_other: "{n} essais",
  tries: "Essais",
  best: "Record",
  erase: "Effacer",
  keypad: "Clavier",
  key_ruled_out: "{d}, éliminé dans tes notes",
  slot_empty: "Case {n}, vide",
  slot_filled: "Case {n}, {d}",
  reels: "Ton essai, quatre chiffres",
  try_label: "Essai {n} : {guess}. {verdict}",
  reuse: "Appuie pour réutiliser ces chiffres.",
  reuse_short: "Réutiliser ces chiffres",

  crack_it: "Craquer",
  new_code: "Nouveau code",
  quit: "Quitter",
  show_code: "Voir le code",
  show_code_left: "Voir le code ({n} restants aujourd’hui)",
  code_shown: "Code affiché",
  no_reveals: "Plus d’aide aujourd’hui",
  reveals_left: "{n} aides sur {max} restantes aujourd’hui",
  revealed_readout: "Le code est {code}. Cette partie ne comptera pas pour ton record.",
  this_game: "Cette partie",
  your_board: "Ton plateau",
  next_code: "Code suivant",
  cracked: "Code craqué !",
  new_best: "Nouveau record",
  code_was: "{tries}. Le code était :",
  revealed_note: "Code révélé — partie non comptée.",
  see_board: "Voir le plateau",
  menu: "Menu",
  new_q: "Nouveau code ?",
  new_warning: "Cette partie sera abandonnée. Elle ne comptera pas dans ton record.",
  keep_this: "Continuer celle-ci",
  saved_warning: "Ta partie est enregistrée sur cet appareil : tu pourras la reprendre plus tard.",

  leave_q: "Quitter la table ?",
  leave_default: "Ta partie en cours sera perdue.",
  keep_playing: "Continuer à jouer",
  leave: "Quitter",
  leave_table: "Quitter la table",
  leave_warning: "Tu abandonnes ta place, et {name} restera seul à la table.",

  how_to_play: "Comment jouer",
  how_rule: "Trouve le code caché : quatre chiffres différents, jamais de 0 en premier.",
  how_bars: "Les barres comptent. Elles ne désignent jamais un chiffre.",
  legend_exact: "Bon chiffre, bonne place",
  legend_near: "Bon chiffre, mauvaise place",
  legend_absent: "Aucun n'est dans le code",
  ruled_out: "Éliminés",
  rule_out: "Éliminer {d}",
  hold_tip: "Astuce : maintiens une touche du clavier pour l'éliminer.",
  scene: "Décor",
  theme_dusk: "Soir",
  theme_beach: "Plage",
  theme_snow: "Neige",
  theme_autumn: "Automne",
  settings: "Réglages",
  characters: "Personnages",
  language: "Langue",
  close: "Fermer",

  rival: "ton adversaire",
  rival_cap: "Ton adversaire",
  st_lost: "Connexion perdue — reconnexion…",
  st_finding: "Recherche de la table…",
  st_lobby: "En attente d’un adversaire…",
  st_set: "Choisis ton code secret",
  st_waiting: "En attente de {name}…",
  st_your_turn: "À toi",
  st_their_turn: "Au tour de {name}",
  st_over: "Partie terminée",
  dropped: "{name} s’est déconnecté. Sa place est gardée quelques minutes.",
  dropped_short: "{name} s’est déconnecté pour l’instant.",
  left_notice: "{name} a quitté la table. Elle est ouverte à un nouvel adversaire.",
  link_copied: "Lien copié",
  link_manual: "Copie le lien dans la case ci-dessous",
  share_text: "Rejoins ma table : {code}",
  table: "Table",
  table_n: "Table {code}",
  table_link: "Lien de la table",
  take_seat: "Prends place",
  pick_name: "Choisis le nom que verra ton adversaire.",
  sit_down: "S’asseoir",
  server_silent: "Le serveur ne répond pas. Nouvelle tentative…",
  share_code: "Partage ce code avec ton ami",
  copy_link: "Copier le lien",
  share: "Partager…",
  lobby_hint: "Ton ami ouvre le lien, ou saisit {code} sur la page d’accueil. Tu joues sous le nom {name}.",
  round: "Manche",
  round_short: "M",
  hide_code: "Cacher ton code",
  show_your_code: "Afficher ton code",
  results: "Résultat",
  boards: "Plateaux",
  your_hunt: "Tes essais",
  their_hunt: "Ses essais",
  name_hunt: "Essais de {name}",
  your_secret: "Ton code secret",
  locked_in: "Verrouillé",
  their_guesses: "Ses essais",
  they_guessed: "Essai adverse : {code}. {verdict}",
  nothing_yet: "Rien pour l’instant.",
  closest: "Son meilleur essai",
  your_notes: "Tes notes",
  fire: "Tirer",
  lock_in: "Verrouiller",
  their_turn: "Patience…",
  sending: "Envoi…",
  rematch: "Revanche",
  rematch_in: "Revanche — {name} est partant",
  you_win: "Gagné !",
  name_wins: "{name} gagne",
  you_cracked: "Code craqué à la manche {n}.",
  they_cracked: "{name} a craqué ton code à la manche {n}.",
  their_code_was: "Son code était",
  see_boards: "Voir les plateaux",

  messages: "Messages",
  messages_new: "Messages, nouveau message",
  messages_with: "Messages avec {name}",
  no_messages: "Aucun message.",
  say_to: "Écris à {name}",
  message: "Message",
  send: "Envoyer",
  you_said: "Toi : ",
  bubble_label: "Message : {text}. Touche pour fermer.",

  fatal_no_room_t: "Cette table est fermée",
  fatal_no_room_b: "Le code est peut-être mal saisi, ou la table s’est fermée après le départ de tous. Tu peux la rouvrir et partager le lien.",
  fatal_no_room_a: "Ouvrir cette table",
  fatal_full_t: "Cette table est complète",
  fatal_full_b: "Deux joueurs sont déjà assis. Demande un nouveau lien, ou crée ta propre table.",
  fatal_replaced_t: "Ouverte ailleurs",
  fatal_replaced_b: "Cette place a été reprise dans un autre onglet ou une autre fenêtre.",
  fatal_replaced_a: "Jouer ici",
  fatal_version_t: "Le jeu a été mis à jour",
  fatal_version_b: "Actualise pour obtenir la nouvelle version. Ta place est gardée.",
  fatal_version_a: "Actualiser",
  fatal_busy_t: "Le serveur est occupé",
  fatal_busy_b: "Réessaie dans un instant.",
  fatal_bad_room_t: "Code de table invalide",
  fatal_bad_room_b: "Un code de table fait cinq lettres et chiffres. Vérifie le lien et réessaie.",
  fatal_other_t: "Un problème est survenu",
  try_again: "Réessayer",
  back_to_menu: "Retour au menu",

  e_bad_code: "Ce code n’est pas valide.",
  e_not_now: "Pas maintenant.",
  e_rate_limited: "Doucement !",
  e_bad_message: "Le message n’est pas passé.",
};

const DICT: Record<Lang, Record<Key, string>> = { en, fr };

export type T = (key: Key, vars?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICT[lang][key] ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : s;
}

export function useLang(): Lang {
  return useSettings().lang;
}

export function useT(): T {
  const lang = useLang();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

/** "1 try" / "3 tries" — French treats 0 and 1 as singular. */
export function triesText(lang: Lang, n: number): string {
  const one = lang === "fr" ? n < 2 : n === 1;
  return translate(lang, one ? "tries_one" : "tries_other", { n });
}

const WORDS: Record<Lang, string[]> = {
  en: ["No", "One", "Two", "Three", "Four"],
  fr: ["Aucun", "Un", "Deux", "Trois", "Quatre"],
};

/**
 * A verdict in words, always spelled out: a figure beside a four-digit
 * guess reads as another digit of the code.
 */
export function verdictText(lang: Lang, v: Verdict): string {
  const W = WORDS[lang];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (lang === "fr") {
    if (v.exact === CODE_LENGTH) return "Code craqué.";
    if (v.exact === 0 && v.misplaced === 0) return "Rien. Quatre chiffres éliminés d’un coup.";
    const parts: string[] = [];
    if (v.exact > 0) parts.push(`${W[v.exact].toLowerCase()} bien placé${v.exact > 1 ? "s" : ""}`);
    if (v.misplaced > 0) parts.push(`${W[v.misplaced].toLowerCase()} mal placé${v.misplaced > 1 ? "s" : ""}`);
    return cap(parts.join(", ")) + ".";
  }
  if (v.exact === CODE_LENGTH) return "Cracked it.";
  if (v.exact === 0 && v.misplaced === 0) return "Nothing here. Four digits ruled out at once.";
  const parts: string[] = [];
  if (v.exact > 0) parts.push(`${W[v.exact].toLowerCase()} in the right slot`);
  if (v.misplaced > 0) parts.push(`${W[v.misplaced].toLowerCase()} in the code but elsewhere`);
  return cap(parts.join(", ")) + ".";
}

/** A refusal from the server, in the player's language. */
export function errorText(t: T, code: ErrorCode, fallback: string): string {
  const map: Partial<Record<ErrorCode, Key>> = {
    bad_code: "e_bad_code", not_now: "e_not_now", rate_limited: "e_rate_limited", bad_message: "e_bad_message",
  };
  const key = map[code];
  return key ? t(key) : fallback;
}
