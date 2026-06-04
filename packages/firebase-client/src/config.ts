import type { FirebaseOptions } from "firebase/app";

const ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export type FirebaseEnvKey = (typeof ENV_KEYS)[number];

export function readFirebaseConfigFromEnv(
  env: ImportMetaEnv = import.meta.env,
): FirebaseOptions {
  const missing = ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    console.warn(
      `[skatingx] Firebase env missing (client not initialized): ${missing.join(", ")}`,
    );
  }

  return {
    apiKey: String(env.VITE_FIREBASE_API_KEY ?? ""),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN ?? ""),
    projectId: String(env.VITE_FIREBASE_PROJECT_ID ?? ""),
    storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET ?? ""),
    messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? ""),
    appId: String(env.VITE_FIREBASE_APP_ID ?? ""),
  };
}

export function isFirebaseConfigComplete(config: FirebaseOptions): boolean {
  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId,
  );
}
