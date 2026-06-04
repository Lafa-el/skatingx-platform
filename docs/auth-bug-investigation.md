# Auth Bug Investigation — Anonymous Yes + Registered Email

**Date:** 2026-06-03  
**Confirmed:** Firebase Console shows UID `RXqVPB…`, email `lafa_el@hotmail.com`, email/password provider.  
**Bug:** Settings shows Guest (anonymous), Anonymous Yes, same email.

---

## Symptom

| Source | Status | Anonymous | Email |
|--------|--------|-----------|-------|
| Firebase Console | Registered (email/password) | N/A | lafa_el@hotmail.com |
| Settings UI | Guest (anonymous) | Yes | lafa_el@hotmail.com |

---

## 1. AuthProvider

**File:** `apps/web/src/app/providers/AuthProvider.tsx`

### Findings

| Issue | Detail |
|-------|--------|
| Listener sets stale user | `onAuthStateChanged` called `setUser(currentUser)` with **no `reload()`** |
| `isAnonymous` mapping | `user?.isAnonymous ?? true` — trusts SDK flag only |
| Link/sign-in paths | Called `refreshAuthUser` then `setUser`, but listener could **overwrite** afterward with stale `currentUser` |
| No provider check | Email/password link adds `providerId: "password"` but UI ignored `providerData` |

### Race (root cause)

```text
linkWithCredential / persisted session
  → User.email updated
  → User.isAnonymous still true on in-memory object
  → onAuthStateChanged fires (same UID)
  → setUser(currentUser)  // stale isAnonymous
  → UI: Anonymous Yes + email set
```

`refreshAuthUser` after link could run, then a **later** listener callback still applied the stale snapshot.

---

## 2. Firebase User object mapping

**Package:** `packages/firebase-client/src/auth.ts`

- `refreshAuthUser` exists and calls `reload(currentUser)`.
- No helper to detect **registered** users when `isAnonymous` lies.
- `signInWithEmailPassword` returned `result.user` without mandatory refresh in the helper (provider added second `refreshAuthUser` call).

After link/sign-in, Firebase server state is correct (Console); client `User.isAnonymous` can lag or be overwritten by the listener.

---

## 3. Settings page display

**File:** `apps/web/src/pages/SettingsPage.tsx`

| Field | Logic | Problem |
|-------|--------|---------|
| Status | `isAnonymous ? Guest : Registered` | Follows stale flag |
| Anonymous | `isAnonymous ? Yes : No` | Same |
| Email | `user?.email` | Correct source — shows real email |

UI is **consistent with context** but context reflects **wrong anonymous flag**.

---

## 4. `isAnonymous` calculation

```ts
isAnonymous: user?.isAnonymous ?? true,
```

- Not a separate cache — derived from React `user` state.
- Defaults to `true` only when `user` is null.
- When `user.isAnonymous === true` and `user.email` is set, UI shows the reported bug.

**Missing rule:** If `providerData` includes `password`, user is **not** anonymous regardless of `isAnonymous`.

---

## 5. Account linking flow

1. `linkAnonymousWithEmailPassword` → `linkWithCredential` → `refreshAuthUser` ✓  
2. `AuthProvider.linkEmailPassword` → `setUser(refreshed)` ✓  
3. `onAuthStateChanged` → `setUser(currentUser)` without refresh ✗ **overwrites**

Same pattern affects **returning visitors** with a persisted linked session: first listener event may use stale flags.

---

## Conclusion

| Layer | Verdict |
|-------|---------|
| UI email field | Correct (`user.email`) |
| UI anonymous/status | Incorrect given Firebase truth |
| Auth state | Stale / overwritten `User` |
| Fix direction | Reload when inconsistent; derive anonymous from `providerData` + `isAnonymous` |

**Fix implemented in:** `packages/firebase-client/src/user.ts`, `AuthProvider`, `SettingsPage` — see [auth-bug-fix-report.md](./auth-bug-fix-report.md).
