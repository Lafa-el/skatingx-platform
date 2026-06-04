# Auth Bug Fix Report — Registered User Shown as Anonymous

**Date:** 2026-06-03  
**Investigation:** [auth-bug-investigation.md](./auth-bug-investigation.md)  
**Symptom:** Firebase Console = email/password user; Settings = Guest + Anonymous Yes + email set.

---

## Fix summary

| Layer | Change |
|-------|--------|
| `packages/firebase-client/src/user.ts` | **New** — `isRegisteredUser`, `isAnonymousUser`, `userNeedsAuthRefresh`, `hasPasswordProvider` |
| `packages/firebase-client/src/auth.ts` | `signInWithEmailPassword` now ends with `refreshAuthUser` |
| `AuthProvider` | Listener syncs user via `resolveUserSnapshot` (reload when email + anonymous mismatch); context uses `isAnonymousUser(user)` |
| `SettingsPage` | Status label **Registered User** when not anonymous |

---

## Root cause (confirmed)

1. `onAuthStateChanged` set React state from `currentUser` **without** `reload()`.
2. After link or restored session, `user.email` updated while `user.isAnonymous` stayed `true`.
3. Context used `user.isAnonymous` only → UI showed Anonymous Yes with a real email.

---

## Solution

### 1. Reliable anonymous / registered detection

```ts
// packages/firebase-client/src/user.ts
isRegisteredUser(user):
  - true if providerData includes "password"
  - else true if email && !user.isAnonymous

isAnonymousUser(user):
  - !isRegisteredUser(user)
```

Registered email/password accounts are treated as **not anonymous** even when the SDK flag is stale.

### 2. Listener refresh when inconsistent

```ts
userNeedsAuthRefresh(user):
  - (has password provider AND isAnonymous) OR (email AND isAnonymous)

resolveUserSnapshot(auth, currentUser):
  - if userNeedsAuthRefresh → refreshAuthUser(auth)
  - else → use currentUser
```

Applied on **every** `onAuthStateChanged` with a signed-in user, so persisted sessions (e.g. UID `RXqVPB…`) reload once when flags disagree.

### 3. Sign-in path

`signInWithEmailPassword` always returns post-`reload()` user (same as link).

### 4. Settings copy

| State | Status | Anonymous |
|-------|--------|-----------|
| Registered | **Registered User** | No |
| Guest | Guest (anonymous) | Yes |

Email remains `user.email`.

---

## Expected behavior after fix

For Firebase user with email/password (Console matches `lafa_el@hotmail.com`):

| Field | Value |
|-------|--------|
| Status | Registered User |
| Anonymous | No |
| Email | lafa_el@hotmail.com |
| Link form | Hidden |
| Sign out | Visible |

For true guest:

| Field | Value |
|-------|--------|
| Status | Guest (anonymous) |
| Anonymous | Yes |
| Email | — |
| Link form | Visible |

---

## Files changed

| File | Action |
|------|--------|
| `packages/firebase-client/src/user.ts` | Added |
| `packages/firebase-client/src/auth.ts` | Sign-in refresh |
| `packages/firebase-client/src/index.ts` | Export user helpers |
| `apps/web/src/app/providers/AuthProvider.tsx` | Listener sync + `isAnonymousUser` |
| `apps/web/src/pages/SettingsPage.tsx` | Registered User label |
| `docs/auth-bug-investigation.md` | Investigation |
| `docs/auth-bug-fix-report.md` | This report |

---

## Verification

```bash
npm run typecheck   # exit 0
npm run build       # exit 0
```

### Manual

1. Sign in or open app with existing linked account (UID `RXqVPB…`).
2. Open `/settings`.
3. Confirm **Registered User**, **Anonymous: No**, correct email.
4. Sign out → new guest → **Guest (anonymous)**, **Anonymous: Yes**, email —.

---

## Related

- [auth-debug-report.md](./auth-debug-report.md)
- [auth-link-flow-fix.md](./auth-link-flow-fix.md)
- [implementation-audit-m1-auth.md](./implementation-audit-m1-auth.md)
