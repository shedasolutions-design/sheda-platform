# Sheda web app

The Sheda product as a web app: Next.js 16 (App Router), React 19, Tailwind 4.
It replaces the Expo app in `apps/mobile` as the way Sheda is built and shipped.
`apps/mobile` stays in the repository, unchanged, until every screen below has moved.

## Running it

```bash
cd apps/web
cp .env.example .env.local     # then fill in what you need
npm install
npm run dev                    # http://localhost:3000
npm run build && npm start     # production build
```

For Google sign-in to work locally, add `http://localhost:3000/google-auth` as an
Authorized redirect URI on the OAuth client in Google Cloud Console. Every origin the
app is served from needs its own `/google-auth` entry.

## How it is put together

```
src/
├── app/                 pages (one folder per URL) and the API route
│   ├── (auth)/              login, signup, otp, forget-pass, reset-pass, pass-changed
│   ├── (tabs)/              home, saved, activity, history, list, inbox, invest, wallet
│   ├── wallet-setup/        create, import, created-successfully
│   ├── google-auth/         where Google sends the browser back to
│   └── api/near/sponsor/    server-side account creation (see below)
├── components/          ui/ is the kit (Button, TextField, Modal, CodeInput ...)
├── server/              code that only ever runs on the server
├── lib/                 browser stand-ins for the phone APIs the logic used
└── services, contexts, hooks, store, config, utilities, types, constants
                         the logic layer, carried over from apps/mobile
```

URLs are the mobile routes without the group names: `/(tabs)/home` is `/home`,
`/(auth)/login` is `/login`, `/details/[id]` is `/details/123`.

### The logic layer came over almost unchanged

Everything that is not a screen (the backend client and its Cloudflare/Render failover,
the NEAR wallet, contract calls, Collections maths, the Redux store and the contexts)
was copied from `apps/mobile` and changed only where it touched a phone API:

| Mobile | Web | Where |
| --- | --- | --- |
| AsyncStorage | localStorage, same promise API | `lib/storage.ts` |
| AppState (foreground/background) | Page Visibility API | `lib/appState.ts` |
| expo-crypto | Web Crypto | `lib/crypto.ts` |
| Keychain | not used: secrets go to IndexedDB under a non-extractable AES key | `services/webSecretStore.ts` |
| expo-notifications | browser Notification API | `services/localNotifications.ts` |
| Face ID / fingerprint | none; behaves like a phone with no lock set | `hooks/useBiometricAuth.ts` |
| expo-auth-session | same-tab redirect; a popup for cloud backup | `hooks/useGoogleAuth.ts` |
| `EXPO_PUBLIC_*` | `NEXT_PUBLIC_*` | `.env.example` |

When porting a screen, reuse the context or hook the mobile screen used. If you find
yourself rewriting logic, check `apps/mobile` first: it is probably already there.

### The funding key stays on the server

The account that pays for new users' NEAR accounts used to be signed for in the app,
so its private key shipped inside the mobile bundle, and on the web build anyone could
read it. Here, `POST /api/near/sponsor` does that work on the server:

- it checks the caller's Sheda session against the backend before signing anything,
- it only creates `<name>.shedauser.testnet` accounts, never a name of the caller's choosing,
- it allows one attempt per user per ten minutes (in memory, per instance).

The key is `NEAR_TESTNET_FUNDING_PRIVATE_KEY`, set on the server only. Never give it a
`NEXT_PUBLIC_` prefix. Without it, signup still works: new users get a free testnet name
or an implicit account instead.

**Rotate the current funding key.** It has been readable in the published Expo web
bundle, so it should be treated as public.

## Porting status

Ported and working in a browser:

- [x] Welcome
- [x] Login, signup, Google sign-in
- [x] Email code, forgot password, reset password, password changed
- [x] Wallet setup: create, import, cloud backup and restore, success
- [x] Home: search, featured, categories, nearby feed with infinite scroll
- [x] Saved
- [x] App shell: sidebar on desktop, tab bar on phones, buyer/seller tabs and badges
- [x] Profile chooser, transaction PIN prompt, toasts, error boundary

Still to move. Each shows a placeholder that links to the same page on the current app:

- [ ] Property details `/details/[id]` (mobile: 1,288 lines, the most used screen after home)
- [ ] Portfolio `/wallet` (1,586 lines: balances, send, receive, intents deposit/withdraw)
- [ ] List a property `/list` (seller listing flow, with `components/seller/*`)
- [ ] Activities `/activity` and History `/history` (deal cards, timeline, damage claims)
- [ ] Inbox and chat
- [ ] Invest and all of `/collections/*` (directory, project, units, stake, holdings, approvals, new raise, become builder)
- [ ] Profile, personal info, profile settings, change password, delete account
- [ ] Notifications and notification settings
- [ ] Filter, see all
- [ ] Book appointment, availability, appointment booked/successful
- [ ] Release document, wallet recovery, support, support feedback, user profile
- [ ] Tests: move the logic tests from `apps/mobile/__tests__` (most are plain TypeScript)
- [ ] Deployment (Vercel, Cloudflare or Coolify) and the CI job for this app
