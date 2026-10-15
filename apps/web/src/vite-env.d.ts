/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** "true" enables the Race Day Companion module (ADR-001 D3). Unset means off. */
  readonly VITE_FEATURE_RACE_DAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
