/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full WebSocket URL of the room server, e.g. wss://rooms.example.com/ws.
   *  Leave unset to use the page's own origin at /ws. */
  readonly VITE_WS_URL?: string;
  /** Plausible-format event endpoint; unset = no usage counting (telemetry.ts) */
  readonly VITE_ANALYTICS_URL?: string;
  readonly VITE_ANALYTICS_DOMAIN?: string;
  /** the build's version, sent with crash reports */
  readonly VITE_VERSION?: string;
  /** how players reach the operator, shown on the privacy and terms pages */
  readonly VITE_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
