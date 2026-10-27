# Crack the Code

Bulls-and-cows deduction. Four different digits, never starting with zero.
Play solo, or 1v1 against a friend over a shared table code.

## Run it

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. That one command starts the Vite dev server
and the room server; Vite proxies `/ws` to the room server, so the browser only
ever talks to one origin.

To play the online mode by yourself, open the table link in a second browser
profile or a private window. A second tab in the *same* browser also works: it
joins as the other player rather than taking over your seat.

To try it from a phone on your Wi-Fi: `npm run dev:web -- --host` and
`npm run dev:server`, then open the "Network" URL Vite prints.

## Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | web + room server together, hot reload |
| `npm test` | engine, protocol, room rules, and a real-socket server test |
| `npm run typecheck` | TypeScript, strict |
| `npm run build` | typecheck, then production bundle into `dist/` |
| `npm start` | production server: room server + `dist/` on one port |

## Layout

```
shared/     engine.ts    pure rules: scoring, validation, codes
            protocol.ts  every wire message, plus the parser that validates them
            room.ts      the room state machine: seats, turns, rematches
server/     index.ts     transport only: HTTP, WebSocket, heartbeats, limits
test/                    node:test suites (no extra dependencies)
src/
  world/    world.ts     the critters' world: table, solid boxes, letters, surfaces
            actor.ts     a critter: state machine, gravity, routes, reactions
            sprites.ts   each sprite's contact point and body size
            measure.ts   the only DOM reader: tagged elements -> rectangles
  hooks/    useDraft     the four-slot composer + keyboard play
            useSoloGame  offline play, best score, daily reveal budget, saved board
            useRoom      the socket: seat tokens, reconnects, errors
            useTheme     palette swap via <html data-theme>
            useCritters  spawn scheduler for the wandering characters
  components/            Reels, Keypad, BarMarks, GuessRow, Scene, Critters, Chrome, Rail
  pages/                 Home, Solo, Room
```

`shared/` has no DOM, no network and no framework. A native iOS/Android client
would reuse `engine.ts` and `protocol.ts` as they are and speak the same
WebSocket protocol; nothing in the server is web-specific.

## How the online mode is built

**The server is authoritative.** It holds *both* secrets and performs *every*
scoring operation. A client sends intent and receives truth. A secret never
crosses the wire until the match is over, and every incoming message goes
through `parseClientMessage` before the room logic sees it.

**A seat belongs to a token, not to whoever asks.** Joining a table issues a
random seat token. After a dropped connection only that token gets the seat
back, so nobody else with the table code can take a disconnected player's
seat — or see their secret. The client keeps the token per tab
(`sessionStorage`, a "hard" claim that survives a refresh) and per browser
(`localStorage`, a "soft" claim that gets you back in after closing the tab but
never kicks out another live tab).

**The match ends the moment a code is cracked.** There is no reply turn and
no draw: once one code is out, nothing is left to play for.

**Table talk.** Players can send short messages (60 characters, cleaned by
the server, last 30 kept, wiped when someone leaves). An incoming message is
delivered by a critter in a speech bubble; the history is always in the menu.

**The opening move alternates across a rivalry.** `firstMover` flips on every
rematch. A rematch needs both players to ask for it.

**Connections are allowed to be bad.** The server pings every 20s and drops
half-open sockets; the client reconnects with backoff, and re-checks the
socket as soon as the phone wakes or the network returns. A dropped player's
seat and secret are held for 3 minutes (`SEAT_GRACE_MS`), during which the
rival sees that they dropped out. Leaving with Quit frees the seat at once and
tells the rival.

## Design notes worth keeping

**Feedback is earned bars only, at most two to a line — never a row of four.**
Players consistently mapped mark-to-digit when the marks sat in a line beside
four digits, because that is exactly what Wordle trains you to do. A cluster
has no axis to align against. The capsule holds one bar per hit and grows with
them; a guess with no hits shows a single muted dash. Fill style (solid /
hollow) carries the meaning as well as hue, so it survives colourblindness.
The bars pop in one by one after the row lands, unless reduced motion is on.

**One face: Luckiest Guy.** The old pixel fonts made a 2 look like an S at
small sizes. Luckiest Guy is comic-book lettering with distinct digits. It has
one weight and only capitals, so faux bold is switched off and body text gets
a little extra letter-spacing.

**Hold a digit key to rule it out (touch only).** A long press on the keypad
toggles that digit in the notes instead of placing it, so phone players never
leave the keypad to take notes.

**Verdict text is always spelled out, never figures.** A numeral next to a
four-digit guess reads as another digit of the code. That is also why guess
rows carry no row numbers.

**A reel's digit is plain text.** Visibility must never depend on a decorative
animation.

**The page never scrolls; the ledger does.** Every fixed height is `clamp()`ed
against the viewport height, and the guess ledger is the only elastic region,
so the board compresses to fit any screen. A phone on its side switches the
board to two columns (history left, keypad right). The keypad lays itself out
from the *board's* width (a container query), not the window's.

**Layers come from one scale** (`--z-*` in `index.css`): ambient scene, app,
critters, chrome, scanlines, result card, dialog, toast. Dialogs are portalled
to `<body>` so no transformed ancestor can trap them.

**Critters live in a small world, not on a webpage.** `src/world/` models it
in units of one body height, with the origin at the left end of the board's
top edge (the *table*). The table is the floor: nothing passes through it.
Page elements opt in as scenery — `data-world="box"` (gauges, toolbar
buttons, the status bar) and each title letter (`data-world="letter"`) —
and stand *behind* the critters, like the jump-through platforms of a
platform game: a critter walks and jumps in front of them, jumps up through
them from below, and lands on their tops. (Mark an element
`data-world-solid` to make it a real obstacle; critters then go over it or
turn back.) A critter:

- stands with its sprite's **contact point** on the surface — each sprite
  declares where its feet are (the crab's legs end two rows above the image's
  bottom);
- tours the table: along the top, round the corner, down the side with its
  feet on the frame, along the underside upside down, up the other side and
  back to where it started — at a steady pace, turning on each corner;
- climbs onto the Tries / Best boxes and onto the title, hopping from letter
  to letter, and swings hand over hand under the letters;
- jumps along ballistic arcs under the top of the screen, falls under
  gravity when its footing goes, comes down on a thread, waves, does magic
  (sparkles, or vanishing in a puff and reappearing somewhere else);
- mixes it up: never the same action twice running, less of what it already
  did this visit or what recent visitors did;
- keeps its place on a resize: the same fraction along the table, or of the
  box it stands on, or of its tour.

Critters draw on their own layer above the page chrome; pointer events pass
through them. Stage space is reserved in body heights where the screen
allows: above the board and the header, below the board, and body-wide side
gutters (phones narrower than 360px keep 12px gutters and skip the tour).
In development, `?critter=walk|box|letters|swing|tour|dangle|trick|peek`
summons one.

**Languages.** Every string the player reads lives in `src/i18n.ts`, one
object per language (English and French today). English is the source: its
keys are the type, so a missing translation is a compile error. The language
follows the device and can be changed in the menu. Adding one means adding
one object there.

## Deploying

The production server is one Node process: `npm run build && npm start`. It
serves the built client from `dist/`, the game socket at `/ws`, and a health
check at `/healthz`, all on `PORT`. Because the client and socket share one
origin there is no CORS or mixed-content setup. Render, Railway and Fly all
run it as-is (build command `npm ci --include=dev && npm run build`, start
command `npm start`, Node 20 or newer; `--include=dev` keeps the build tools
even when the host sets `NODE_ENV=production` during install). It must be served over HTTPS so browsers use `wss://`.

**Socket origins.** By default the server only accepts game sockets from the
page it serves itself (the browser's `Origin` must match the request's host,
or `X-Forwarded-Host` behind a proxy), so a single-service deploy needs no
configuration. Other websites cannot open sockets to it. Clients that send no
`Origin` (a future native app) are allowed; seats are bound to tokens, not to
anything ambient.

Split hosting also works: put `dist/` on a static host, run the server
elsewhere, build the client with `VITE_WS_URL=wss://your-server/ws`, and set
`ALLOWED_ORIGINS=https://your-static-site` on the server. See `.env.example`.

State is in memory: a restart or a second instance loses live tables (players
see "This table is closed" and can reopen it). Run exactly one instance. To
scale beyond that, move `rooms` into Redis or host `shared/room.ts` in a
Cloudflare Durable Object — the room logic is already transport-independent.
