import type { Firestore } from "firebase-admin/firestore";

export function assertCatalogProject(projectId: string): void;

export function reviewCatalogVersion(
  db: Firestore,
  input: { objectId: string; contentVersion: string; reviewer: string; decision: "approved" | "rejected" },
): Promise<void>;

export function publishCatalogVersionFlow(
  db: Firestore,
  input: { objectId: string; contentVersion: string; reviewer: string; notes?: string },
): Promise<void>;

export function withdrawCatalogVersion(
  db: Firestore,
  input: { objectId: string; contentVersion: string; actor: string },
): Promise<void>;

export function revokeCatalogApprovalFlow(
  db: Firestore,
  input: { objectId: string; contentVersion: string; actor: string },
): Promise<void>;

export function reviewCatalogLink(
  db: Firestore,
  input: { academyItemId: string; reviewer: string; decision: "approved" | "rejected" },
): Promise<void>;

export function publishCatalogLink(
  db: Firestore,
  input: { academyItemId: string; actor: string },
): Promise<void>;

export function withdrawCatalogLink(
  db: Firestore,
  input: { academyItemId: string; actor: string },
): Promise<void>;
