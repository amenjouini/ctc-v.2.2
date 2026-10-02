/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full WebSocket URL of the room server, e.g. wss://rooms.example.com/ws.
   *  Leave unset to use the page's own origin at /ws. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
