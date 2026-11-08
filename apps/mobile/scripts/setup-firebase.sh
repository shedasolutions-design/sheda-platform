#!/usr/bin/env bash
# ============================================================================
# One-shot Firebase setup for Sheda's encrypted wallet backup.
# ============================================================================
# Run:   bash scripts/setup-firebase.sh
#
# Does everything the Firebase CLI can do without a browser: creates the
# project, creates the Firestore database, registers a web app, pulls its
# config into .env, and deploys the security rules.
#
# Two things it deliberately does NOT do:
#
#   1. Log you in. That needs your Google password and 2FA. Run
#      `firebase login` yourself first — this script only checks that it
#      worked.
#   2. Toggle the Google sign-in provider. Doing that over the API needs a
#      raw OAuth access token for your account, and a setup script is the
#      wrong place to be handling one of those. It is three clicks in the
#      console and the script prints exactly where.
#
# Safe to re-run: every step checks for the existing resource first.
# ============================================================================

set -uo pipefail

# The OAuth client the app already uses for Sheda login (config/google.ts).
# Firebase must be told to trust this same client so backup adds no second
# consent screen.
GOOGLE_CLIENT_ID="333938897540-tt7udprd6mf22erf0go6nfonkn7hqkit.apps.googleusercontent.com"

ENV_FILE=".env"

say()  { printf "\n\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32mOK\033[0m    %s\n" "$*"; }
warn() { printf "  \033[33mNOTE\033[0m  %s\n" "$*"; }
die()  { printf "\n  \033[31mSTOP\033[0m  %s\n\n" "$*"; exit 1; }

# ── 0. Preflight ───────────────────────────────────────────────────────────
say "0. Checking prerequisites"

command -v firebase >/dev/null 2>&1 || die "Firebase CLI missing. Run: npm install -g firebase-tools"
ok "firebase CLI $(firebase --version 2>/dev/null | head -1)"

if ! firebase login:list 2>/dev/null | grep -qiE "logged in|\[.*@.*\]"; then
  die "Not logged in. Run this first, finish it in your browser, then re-run this script:

        firebase login"
fi
ok "logged in as: $(firebase login:list 2>/dev/null | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1)"

# ── 1. Project ─────────────────────────────────────────────────────────────
say "1. Firebase project"

read -r -p "  Project ID to use or create (e.g. sheda-wallet-backup): " PROJECT_ID
[ -n "$PROJECT_ID" ] || die "A project ID is required."

if firebase projects:list 2>/dev/null | grep -qE "\b${PROJECT_ID}\b"; then
  ok "project '$PROJECT_ID' already exists — reusing it"
else
  warn "creating project '$PROJECT_ID'…"
  if ! firebase projects:create "$PROJECT_ID" --display-name "Sheda Wallet Backup"; then
    die "Could not create '$PROJECT_ID'.

  Usually one of:
    - the ID is taken globally (they are unique across all of Firebase) — pick another
    - your account is at its project quota — reuse an existing project instead"
  fi
  ok "project created"
fi

# ── 2. Firestore ───────────────────────────────────────────────────────────
say "2. Firestore database"

if firebase firestore:databases:list --project "$PROJECT_ID" 2>/dev/null | grep -q "(default)"; then
  ok "default database already exists"
else
  warn "creating the default database (location: nam5)…"
  # Production mode: the rules deployed in step 5 are what grant access. Test
  # mode would leave every document world-readable until they land, and a
  # world-readable window on a wallet-backup collection is not a window worth
  # opening even briefly.
  if ! firebase firestore:databases:create "(default)" \
        --project "$PROJECT_ID" --location nam5 2>/dev/null; then
    warn "CLI could not create it. Create it once in the console, then re-run:"
    warn "  https://console.firebase.google.com/project/$PROJECT_ID/firestore"
    warn "  Choose 'Start in production mode'."
    read -r -p "  Press Enter once the database exists… " _
  fi
  ok "database ready"
fi

# ── 3. Web app + config ────────────────────────────────────────────────────
say "3. Web app registration"

if ! firebase apps:list WEB --project "$PROJECT_ID" 2>/dev/null | grep -q "sheda-web"; then
  warn "registering web app 'sheda-web'…"
  firebase apps:create WEB "sheda-web" --project "$PROJECT_ID" >/dev/null 2>&1 \
    || warn "app may already exist under another name — continuing"
fi

SDK_JSON="$(firebase apps:sdkconfig WEB --project "$PROJECT_ID" --json 2>/dev/null)"
[ -n "$SDK_JSON" ] || die "Could not read the web app config. Check: firebase apps:list WEB --project $PROJECT_ID"

extract() { printf '%s' "$SDK_JSON" | grep -oE "\"$1\"\s*:\s*\"[^\"]*\"" | head -1 | sed -E 's/.*:\s*"([^"]*)"/\1/'; }

API_KEY="$(extract apiKey)"
AUTH_DOMAIN="$(extract authDomain)"
APP_ID="$(extract appId)"

[ -n "$API_KEY" ] || die "Could not parse apiKey out of the SDK config."
ok "apiKey     ${API_KEY:0:12}…"
ok "authDomain $AUTH_DOMAIN"
ok "appId      ${APP_ID:0:24}…"

# ── 4. Write .env ──────────────────────────────────────────────────────────
say "4. Writing $ENV_FILE"

[ -f "$ENV_FILE" ] || { cp .env.example "$ENV_FILE" 2>/dev/null && ok "seeded $ENV_FILE from .env.example"; }
touch "$ENV_FILE"

set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Portable in-place edit — BSD and GNU sed disagree about -i.
    grep -vE "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
  fi
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

set_env EXPO_PUBLIC_FIREBASE_API_KEY     "$API_KEY"
set_env EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN "$AUTH_DOMAIN"
set_env EXPO_PUBLIC_FIREBASE_PROJECT_ID  "$PROJECT_ID"
set_env EXPO_PUBLIC_FIREBASE_APP_ID      "$APP_ID"
ok "four EXPO_PUBLIC_FIREBASE_* values written (.env is gitignored)"

# ── 5. Security rules ──────────────────────────────────────────────────────
say "5. Deploying Firestore security rules"

if firebase deploy --only firestore:rules --project "$PROJECT_ID" --non-interactive; then
  ok "rules deployed from firestore.rules"
else
  die "Rules deploy failed. Do NOT use backup until this succeeds — without
  these rules the backup collection has no per-user access control."
fi

# ── 6. What is left for a human ────────────────────────────────────────────
say "6. Two things left that need the console"

cat <<MANUAL

  A. Enable Google sign-in  (three clicks)

     https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers

       1. Authentication -> Get started (if prompted) -> Sign-in method
       2. Add new provider -> Google -> toggle Enable
       3. Expand "Web SDK configuration" and paste BOTH fields:

          Web client ID:     $GOOGLE_CLIENT_ID
          Web client secret: (from Google Cloud Console, same OAuth client)

     Pasting the app's existing client ID is what keeps this to one consent
     screen. A different client ID here means users get prompted twice and
     the id_token audience will not match.

  B. Add the same four values as GitHub secrets, so CI builds get them:

     gh secret set EXPO_PUBLIC_FIREBASE_API_KEY --body "$API_KEY"
     gh secret set EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --body "$AUTH_DOMAIN"
     gh secret set EXPO_PUBLIC_FIREBASE_PROJECT_ID --body "$PROJECT_ID"
     gh secret set EXPO_PUBLIC_FIREBASE_APP_ID --body "$APP_ID"

  Then verify locally:

     npx expo start -c        # -c is required: EXPO_PUBLIC_* is inlined at build time

  The "Back up your wallet" prompt appears after creating or importing a
  wallet once isFirebaseConfigured() sees these values.

MANUAL

say "Done."
