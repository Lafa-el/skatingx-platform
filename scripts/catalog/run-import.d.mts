import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";

export const PRODUCTION_APP_NAME: string;

export function bindVerifiedAdc(file: string): unknown;

export function openProductionFirestore(adcFile: string): Promise<App>;

export function productionFirestore(app: App): Promise<Firestore>;

export function countAuthUsers(app: App | null | undefined): Promise<{ status: "available"; count: number }>;
