/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the toolbox-njtransit-bus-api Cloud Run service (set by CI). */
  readonly VITE_NJTRANSIT_BUS_API_URL?: string;
}
