import { Link } from "react-router-dom";
import { Masthead } from "@/components/Chrome";
import type { Theme } from "@/hooks/useTheme";
import { useLang, useT, type Lang } from "@/i18n";

/**
 * The privacy policy and the terms of use. They describe what the game
 * actually does today; when it starts doing something new with data
 * (accounts, ads, payments), these pages change in the same commit.
 *
 * VITE_CONTACT_EMAIL is shown as the way to reach the operator; without it
 * the pages point to the feedback form in the menu.
 */
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;
/** Shown at the top of both pages; change it whenever the text changes. */
export const LEGAL_UPDATED = "2026-11-17";

type Section = { h: string; p: string[] };

const contact = (lang: Lang) =>
  CONTACT
    ? lang === "fr" ? `par e-mail à ${CONTACT}` : `by email at ${CONTACT}`
    : lang === "fr" ? "avec le formulaire « Ton avis » du menu" : "with the Feedback form in the menu";

function privacy(lang: Lang): Section[] {
  if (lang === "fr") {
    return [
      { h: "En bref", p: [
        "Pas de compte, pas de publicité, pas de cookies, pas de pistage. Presque tout ce que le jeu retient reste sur ton appareil.",
      ] },
      { h: "Sur ton appareil", p: [
        "Le jeu enregistre dans le stockage local de ton navigateur : tes réglages (décor, langue, personnages, son), le nom que tu choisis, ton record, ta partie solo en cours, tes résultats du défi du jour et le nombre d’aides utilisées aujourd’hui. Pour reprendre ta place à une table après une coupure, il garde aussi un jeton de place.",
        "Rien de tout cela n’est envoyé ailleurs. Pour l’effacer, efface les données de ce site dans ton navigateur.",
      ] },
      { h: "Quand tu joues en ligne", p: [
        "Le serveur reçoit le nom que tu choisis, le code de la table, ton code secret, tes essais et tes messages. Il les garde en mémoire seulement le temps de la partie : ils disparaissent quand la table ferme (au plus tard 30 minutes après le départ des joueurs) ou quand le serveur redémarre. Rien n’est écrit sur disque.",
        "Ton adresse IP sert, en mémoire uniquement et pendant quelques minutes, à limiter les abus (par exemple quelqu’un qui essaie des codes de table au hasard). Elle n’est pas enregistrée.",
      ] },
      { h: "Rapports d’erreur et avis", p: [
        "Si le jeu plante dans ton navigateur, il envoie au serveur le message d’erreur, la page, la version du jeu, la langue et le type de navigateur. Quand tu envoies un avis, il envoie ton texte avec les mêmes informations. Ni ton adresse IP, ni ton nom, ni ta partie ne sont joints. Ces rapports sont écrits dans le journal du serveur, conservé par notre hébergeur pour une durée limitée.",
      ] },
      { h: "Mesure d’audience", p: [
        "Si elle est activée, nous comptons les pages vues et quelques actions (comme partager un résultat) avec un service de mesure sans cookies qui ne stocke aucune donnée personnelle. Les adresses des tables ne sont jamais transmises.",
      ] },
      { h: "Hébergement", p: [
        "Le jeu est hébergé par Render (render.com), qui traite les requêtes pour nous. Nous ne vendons ni ne partageons aucune donnée.",
      ] },
      { h: "Enfants", p: [
        "Le jeu ne demande aucune donnée personnelle. Le chat ne sert qu’entre deux joueurs à une même table, qui se partagent le code eux-mêmes.",
      ] },
      { h: "Tes droits", p: [
        `Tu peux demander à savoir quelles données nous avons sur toi, les faire corriger ou supprimer. Contacte-nous ${contact(lang)}. Comme nous ne gardons presque rien, la réponse sera souvent : rien.`,
      ] },
    ];
  }
  return [
    { h: "In short", p: [
      "No accounts, no ads, no cookies, no tracking. Almost everything the game remembers stays on your device.",
    ] },
    { h: "On your device", p: [
      "The game saves in your browser’s local storage: your settings (scene, language, characters, sound), the name you pick, your best score, your unfinished solo board, your daily puzzle results and how many reveals you used today. To give you back your seat at a table after a dropped connection, it also keeps a seat token.",
      "None of this is sent anywhere. To erase it, clear this site’s data in your browser.",
    ] },
    { h: "When you play online", p: [
      "The server receives the name you pick, the table code, your secret code, your guesses and your messages. It holds them in memory only for the game: they are gone when the table closes (at most 30 minutes after the players leave) or when the server restarts. Nothing is written to disk.",
      "Your IP address is used, in memory only and for a few minutes, to limit abuse (for example someone trying random table codes). It is not recorded.",
    ] },
    { h: "Crash reports and feedback", p: [
      "If the game crashes in your browser, it sends the server the error message, the page, the game’s version, the language and the browser type. When you send feedback, it sends your text with the same details. Your IP address, name and board are not included. These reports go into the server log, which our host keeps for a limited time.",
    ] },
    { h: "Audience measurement", p: [
      "When it is switched on, we count page views and a few actions (like sharing a result) with a cookie-free analytics service that stores no personal data. Table addresses are never sent.",
    ] },
    { h: "Hosting", p: [
      "The game is hosted by Render (render.com), which handles requests for us. We do not sell or share any data.",
    ] },
    { h: "Children", p: [
      "The game asks for no personal data. Chat only works between the two players at a table, who share its code themselves.",
    ] },
    { h: "Your rights", p: [
      `You can ask what data we hold about you, and have it corrected or deleted. Contact us ${contact(lang)}. Since we keep almost nothing, the answer will usually be: nothing.`,
    ] },
  ];
}

function terms(lang: Lang): Section[] {
  if (lang === "fr") {
    return [
      { h: "Le jeu", p: [
        "Crack the Code est gratuit. Tu peux y jouer tant que tu respectes ces règles.",
      ] },
      { h: "Jouer franc-jeu", p: [
        "N’essaie pas de tricher, de perturber le serveur, de deviner les codes des tables des autres ou de contourner les limites du jeu.",
      ] },
      { h: "Le chat", p: [
        "Sois correct avec ton adversaire. Pas d’insultes, de harcèlement, de contenu haineux ou sexuel, ni de données personnelles (les tiennes ou celles des autres).",
      ] },
      { h: "Sans garantie", p: [
        "Le jeu est fourni tel quel. Il peut changer, être indisponible ou perdre une partie en cours (par exemple pendant une mise à jour). Dans la limite de la loi, nous ne sommes pas responsables des conséquences.",
      ] },
      { h: "Changements", p: [
        `Ces conditions peuvent évoluer ; la date en haut de la page indique la dernière version. Une question ? Contacte-nous ${contact(lang)}.`,
      ] },
    ];
  }
  return [
    { h: "The game", p: [
      "Crack the Code is free to play. You may play it as long as you follow these rules.",
    ] },
    { h: "Fair play", p: [
      "Do not try to cheat, disrupt the server, guess other people’s table codes, or get around the game’s limits.",
    ] },
    { h: "Chat", p: [
      "Be decent to your opponent. No insults, harassment, hateful or sexual content, and no personal details (yours or anyone else’s).",
    ] },
    { h: "No warranty", p: [
      "The game is provided as is. It may change, be unavailable, or lose a game in progress (for example during an update). As far as the law allows, we are not liable for what follows from that.",
    ] },
    { h: "Changes", p: [
      `These terms may change; the date at the top shows the latest version. Questions? Contact us ${contact(lang)}.`,
    ] },
  ];
}

export function Legal({ page, theme, setTheme }: { page: "privacy" | "terms"; theme: Theme; setTheme: (t: Theme) => void }) {
  const t = useT();
  const lang = useLang();
  const sections = page === "privacy" ? privacy(lang) : terms(lang);
  return (
    <div className="shell relative mx-auto w-full max-w-[720px]">
      <Masthead theme={theme} setTheme={setTheme} />
      <div className="shell-scroll">
        <article className="frame legal p-5 sm:p-7">
          <h1 className="title mb-1" style={{ fontSize: 28 }}>{t(page === "privacy" ? "privacy" : "terms")}</h1>
          <p className="eyebrow mb-5">{t("legal_updated", { date: LEGAL_UPDATED })}</p>
          {sections.map((s) => (
            <section key={s.h} className="mb-5">
              <h2 className="eyebrow mb-2">{s.h}</h2>
              {s.p.map((p, i) => <p key={i} className="copy mb-2">{p}</p>)}
            </section>
          ))}
          <Link to="/" className="btn-wood mt-2 inline-block">{t("back_to_menu")}</Link>
        </article>
      </div>
    </div>
  );
}
