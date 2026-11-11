#!/usr/bin/env bash
# =============================================================================
# test_all_routes_live.sh — Hit every route on a live Sheda backend deployment
#
# Usage:
#   ./tests/test_all_routes_live.sh                       # default: http://localhost:8000
#   ./tests/test_all_routes_live.sh https://sheda.peni.dev
# =============================================================================
set -euo pipefail

BASE_URL="${1:-http://localhost:8000}"
PASS=0
FAIL=0
WARN=0

green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

# hit METHOD PATH EXPECTED_CODES...
# Returns 0 if the status code is in the expected list, 1 otherwise.
hit() {
    local method="$1" path="$2"; shift 2
    local expected=("$@")
    local url="${BASE_URL}${path}"

    local status
    status=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" \
        -H 'Content-Type: application/json' \
        --max-time 10 \
        "$url" 2>/dev/null || echo "000")

    local ok=false
    for code in "${expected[@]}"; do
        if [[ "$status" == "$code" ]]; then ok=true; break; fi
    done

    if $ok; then
        green "  PASS  $method $path -> $status"
        PASS=$((PASS + 1))
    elif [[ "$status" == "404" ]]; then
        red "  FAIL  $method $path -> $status (ROUTE NOT FOUND)"
        FAIL=$((FAIL + 1))
    else
        yellow "  WARN  $method $path -> $status (expected: ${expected[*]})"
        WARN=$((WARN + 1))
    fi
}

echo "=============================================="
echo " Testing all routes on: $BASE_URL"
echo "=============================================="

echo ""
echo "--- OpenAPI / Docs ---"
hit GET  /sheda-docs      200
hit GET  /docs             200 307
hit GET  /openapi.json     200

echo ""
echo "--- Health ---"
hit GET  /health                    200
hit GET  /api/v1/health             200
hit GET  /api/v1/health/live        200
hit GET  /api/v1/health/ready       200 503
hit GET  /api/v1/health/detailed    200
hit GET  /api/v1/health/stats       200

echo ""
echo "--- Auth ---"
hit POST /api/v1/auth/signup                  422
hit POST /api/v1/auth/social-login            422
hit POST /api/v1/auth/verify-account          401 403
hit POST /api/v1/auth/login                   401 422
hit POST /api/v1/auth/logout                  401 403
hit PUT  /api/v1/auth/reset-password          401 403
hit POST /api/v1/auth/send-otp                401 403
hit POST /api/v1/auth/verify-otp              401 403
hit PUT  /api/v1/auth/refresh-token           401 403
hit POST /api/v1/auth/switch-account          401 403
hit POST /api/v1/auth/forgot-password         422
hit POST /api/v1/auth/verify-forgot-password  422

echo ""
echo "--- User ---"
hit GET    /api/v1/user/me                       401 403
hit GET    /api/v1/user/1                         401 403
hit PUT    /api/v1/user/update/me                 401 403
hit DELETE /api/v1/user/me                        401 403
hit POST   /api/v1/user/book-appointment          401 403
hit DELETE /api/v1/user/cancel-appointment/1      401 403
hit POST   /api/v1/user/create-payment-info       401 403
hit GET    /api/v1/user/payment-info              401 403
hit PUT    /api/v1/user/update-account-info/1     401 403
hit DELETE /api/v1/user/delete-accnt-info/1       401 403
hit GET    /api/v1/user/payment-info/1            401 403
hit POST   /api/v1/user/create-available-time     401 403
hit GET    /api/v1/user/get-schedule/me           401 403
hit PUT    /api/v1/user/update-schedule/1         401 403
hit POST   /api/v1/user/confirm-payment/1         401 403
hit POST   /api/v1/user/approve-payment/1         401 403
hit POST   /api/v1/user/contracts/                401 403
hit PUT    /api/v1/user/confirm-appointment/1     401 403
hit POST   /api/v1/user/kyc/start-verification    401 403
hit GET    /api/v1/user/kyc/status/abc            401 403
hit GET    /api/v1/user/kyc/is-verified/1         401 403

echo ""
echo "--- Property ---"
hit POST   /api/v1/property/list-property        401 403
hit GET    /api/v1/property/me                   401 403
hit PUT    /api/v1/property/update/1             401 403
hit GET    /api/v1/property/get-properties       200 401 403
hit GET    /api/v1/property/details/1            401 403
hit GET    /api/v1/property/agent-profile/1      401 403
hit DELETE /api/v1/property/delete/1             401 403
hit GET    "/api/v1/property/search?query=test"  200 401 403 500
hit POST   /api/v1/property/1/index              401 403

echo ""
echo "--- Chat ---"
hit GET  /api/v1/chat/chat-history     401 403
hit GET  /api/v1/chat/conversations    401 403
hit GET  /api/v1/chat/history/1        401 403
hit POST /api/v1/chat/send-message     401 403
hit POST /api/v1/chat/mark-read/1      401 403
hit GET  /api/v1/chat/unread-count     401 403

echo ""
echo "--- Media ---"
hit POST /api/v1/media/file-upload/profile   401 403 422
hit GET  /api/v1/media/file-upload/profile   401 403
hit POST /api/v1/media/ipfs-upload           401 403 422

echo ""
echo "--- Rating ---"
hit POST /api/v1/rating/   401 403

echo ""
echo "--- Transactions ---"
hit GET  /api/v1/transactions                            401 403
hit POST /api/v1/transactions/1/upload-documents         401 403 422
hit GET  /api/v1/transactions/timeouts                   401 403
hit POST /api/v1/transactions/submit-bid-tx              401 403
hit POST /api/v1/transactions/process-payment            401 403
hit POST /api/v1/transactions/mint-property-nft          401 403
hit POST /api/v1/transactions/send-transaction-notification 401 403
hit POST /api/v1/transactions/confirm-payment/1          401 403
hit GET  /api/v1/transactions/task-status/1              401 403

echo ""
echo "--- Notifications ---"
hit POST /api/v1/notifications/transaction-update       401 403
hit GET  /api/v1/notifications                          401 403
hit POST /api/v1/notifications/1/read                   401 403
hit POST /api/v1/notifications/register-device          401 403
hit POST /api/v1/notifications/send                     401 403
hit POST /api/v1/notifications/send-bid-notification    401 403
hit POST /api/v1/notifications/send-payment-notification 401 403

echo ""
echo "--- Wallets ---"
hit GET  /api/v1/users/by-wallet/test_wallet   401 403
hit POST /api/v1/users/wallets/register        401 403

echo ""
echo "--- Minted Properties ---"
hit POST /api/v1/minted-properties/register             401 403
hit POST /api/v1/minted-properties/1/create-listing     401 403

echo ""
echo "--- Indexer ---"
hit POST /api/v1/indexer/transactions   401 403 422

echo ""
echo "=============================================="
echo " Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "=============================================="

if [[ $FAIL -gt 0 ]]; then
    red "SOME ROUTES ARE BROKEN (returned 404)"
    exit 1
else
    green "ALL ROUTES ARE REACHABLE"
    exit 0
fi
