# Critical Fixes & Lessons Learned

## 1. Google OAuth Environment Variables (CRITICAL)
**Problem:** All environment variables on Vercel were empty strings (`""`) despite being set in the Vercel UI. This caused "Error 400: redirect_uri_mismatch" and prevented any Google OAuth logins.

**Root Cause:** The Vercel web UI doesn't always persist environment variables reliably, or there was a race condition with the git integration.

**Fix Applied:**
```bash
npx vercel env rm VAR_NAME --yes  # Delete all problematic vars
npx vercel env add VAR_NAME production --value "actual_value" --yes  # Re-add via CLI
```

**Lesson:** Always use Vercel CLI for environment variables, not the web UI. CLI is atomic and reliable.

**Reference Commit:** acc100c (Deploy to Vercel once env vars issue is resolved)

---

## 2. Role System Mismatch (SECURITY)
**Problem:** Code used PUBLISHER role but requirements specified HIRING_MANAGER. System had 4 roles in code but only 3 were correctly implemented.

**Fix Applied:**
- Replaced PUBLISHER with HIRING_MANAGER in:
  - `lib/auth/roles.ts` (roleNames, rolePermissions)
  - `lib/navigation/modules.ts` (normalizeRule, createDefaultModuleAccessPolicy)
  - `components/settings/ModuleVisibilityAccessPanel.tsx`
  - `app/settings/page.tsx` (access restriction)

**New Role Hierarchy Added:**
```typescript
export const ROLE_RANK: Record<RoleName, number> = {
  "ADMIN": 0,           // Full access + settings
  "RECRUITER": 1,       // Full recruiting features, no settings
  "HIRING_MANAGER": 2,  // Read-only candidates, jobs, calendar
  "VIEWER": 3,          // Read-only everything
};
```

**Lesson:** Always verify role names and permissions match requirements before building features.

**Reference Commit:** fed8782 (Add HIRING_MANAGER role and fix role-based navigation)

---

## 3. New User Default Role Too Permissive (SECURITY)
**Problem:** New users who signed in got RECRUITER role (full access) automatically. New team members should have minimal access until admin grants it.

**Fix Applied:**
- `auth.ts` line 51: Changed `initialRoleForEmail()` to return "VIEWER" instead of "RECRUITER"
- `prisma/schema.prisma` line 140: Changed User model default from `"RECRUITER"` to `"VIEWER"`
- `auth.ts` line 120: Changed session callback fallback to "VIEWER"

**Lesson:** Default to least privilege. New users should need explicit admin approval to access features.

**Reference Commit:** 166c78f (Fix default role for new users: change from RECRUITER to VIEWER)

---

## 4. Settings Pages "Something Went Wrong" Error (MULTI-PART)
**Problems:**

### 4a. Wrong API Endpoint URL
- **Issue:** `UsersManagementWorkspace` called `/api/admin/users/${userId}/role` 
- **Should be:** `/api/admin/users/${userId}`
- **Fix:** Updated endpoint URL in component line 29

### 4b. Division by Zero
- **Issue:** When no activities exist, calculating average per person: `total / byUser.length` = `0 / 0` = NaN
- **Fix:** Added null check: `Object.keys(byUser).length > 0 ? (total / length) : "0"`

### 4c. Missing Empty States
- **Issue:** Activity Breakdown and Team Contribution sections crashed if empty
- **Fix:** Added empty state checks with fallback messages

### 4d. Date Serialization
- **Issue:** Prisma returns `Date` objects, but client components can't receive them directly (not serializable to JSON)
- **Fix:** Convert to ISO strings in server component: `createdAt.toISOString()`

### 4e. Dynamic Rendering Error
- **Issue:** Pages using `headers()` were trying to render statically
- **Fix:** Added `export const dynamic = "force-dynamic"` to both pages

### 4f. No Error Boundaries
- **Issue:** Any error crashed the entire page with generic "Something went wrong"
- **Fix:** Added try-catch blocks with helpful error messages

**Reference Commit:** 0a3617f (Fix Settings page errors: serialization and dynamic rendering)

---

## 5. Database Schema Not Synced (CRITICAL)
**Problem:** Prisma schema included `UserPermission` and `ActivityLog` models, but these tables didn't exist in the actual Neon database. When pages tried to query `prisma.user.findMany({ include: { permissions: true } })`, it failed with "table public.UserPermission does not exist".

**Fix Applied:**
```bash
npx prisma db push
```

**Lesson:** After modifying Prisma schema, ALWAYS sync to database before deploying:
1. Commit schema changes
2. Run `prisma db push` or `prisma migrate deploy`
3. Verify with `prisma db execute --stdin < query.sql` if needed
4. Then deploy code

**Never** deploy code that references database tables that don't exist yet.

---

## How to Prevent These Issues

1. **Environment Variables:** Always use Vercel CLI, never UI
2. **Role Changes:** Update all role references in one PR—use grep to find them
3. **API Endpoints:** Test endpoints exist before using them in components
4. **Server→Client Data:** Serialize non-JSON types (Date, BigInt, etc.) before passing
5. **Dynamic Routes:** Use `export const dynamic = "force-dynamic"` if page uses `headers()`, `cookies()`, etc.
6. **Database:** Run migrations/`db push` immediately after schema changes, before deploying

---

## Quick Reference for Common Fixes

### "Table X does not exist"
```bash
npx prisma db push
```

### "Could not process token: invalid token" (Auth)
- Check: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL
- Use: `npx vercel env ls` to verify vars are set
- Fix: `npx vercel env add VAR production --value "x" --yes`

### "Data not serializable to JSON" (Server→Client)
- Convert: `new Date()` → `date.toISOString()`
- Convert: `BigInt` → `number` or `string`
- Test: `JSON.stringify(data)` before passing to client component

### Pages try to render statically but use headers()
```typescript
export const dynamic = "force-dynamic";
```

### Empty data crashes component
```typescript
if (data.length > 0) {
  // render data
} else {
  // empty state
}
```
