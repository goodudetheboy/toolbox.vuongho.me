/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** Base URL of the toolbox-study-assistant-api Cloud Run service (set by CI). */
  readonly VITE_STUDY_API_URL?: string;
  /** Dev only: "1" swaps Firebase + the API for in-memory fakes (UI work without a key). */
  readonly VITE_MOCK?: string;
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
}
