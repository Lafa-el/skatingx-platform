export const PRODUCTION_APP_NAME: string;

export function credentialFromVerifiedAdc(payload: unknown): {
  getAccessToken: () => Promise<{ access_token: string; expires_in: number }>;
};

export function openProductionFirestore(payload: unknown): Promise<{ name: string }>;

export function countAuthUsers(app: { name?: string } | null | undefined): Promise<{ status: "available"; count: number }>;
