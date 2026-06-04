import type { User } from "firebase/auth";

/** Email/password (or legacy "password" provider) on a linked or registered account. */
export function hasPasswordProvider(user: User): boolean {
  return user.providerData.some((p) => p.providerId === "password");
}

/**
 * True when the account is a permanent email/password user, even if
 * `user.isAnonymous` is stale on the client after link or listener races.
 */
export function isRegisteredUser(user: User | null): boolean {
  if (!user) {
    return false;
  }
  if (hasPasswordProvider(user)) {
    return true;
  }
  return Boolean(user.email) && !user.isAnonymous;
}

/** Guest session — no password provider and still anonymous (or no user). */
export function isAnonymousUser(user: User | null): boolean {
  if (!user) {
    return true;
  }
  return !isRegisteredUser(user);
}

/**
 * Client User snapshot can have email set while isAnonymous is still true.
 * Reload from server before trusting the anonymous flag.
 */
export function userNeedsAuthRefresh(user: User): boolean {
  if (hasPasswordProvider(user) && user.isAnonymous) {
    return true;
  }
  if (user.email && user.isAnonymous) {
    return true;
  }
  return false;
}
