/** Versioned content bundles (academy, plans, i18n) — populated during migration. */

export const CONTENT_VERSION = "0.0.0-skeleton" as const;

export const placeholderContent = {
  contentVersion: CONTENT_VERSION,
  message: "Content package ready for academy, plans, and i18n assets.",
} as const;
