# Deploying the Collections contracts

The contracts in `contracts/` are ahead of the deployment the app currently
points at. `sheda-raise-v1.testnet` was built before `set_unit_vault`,
`shares_owed`, the unit list on `get_project`, and the per-flat vault flow.
That is why a commitment cannot be turned into shares against it: the
contract has nowhere to record the vault a claim should mint from.

This runbook deploys the current wasm, points the app at it, and walks one
raise from creation through a claim. It is written for testnet and for an
operator who holds the deploy keys. It is not a mainnet procedure.

The commands use `near-cli-rs` with a keychain. Run `near --version` first;
0.23.x is what was tested. Every write is signed by the account named in
`sign-as`; nothing here uses a server-held key.

## 0. Variables

```bash
export OWNER=shedauser.testnet          # the account that will pay for sub-accounts
export RAISE=sheda-raise-v2.testnet     # new raise/escrow account
export STAKE=sheda-stake-v2.testnet     # new stake registry account
export VAULT=flat-1a.shedauser.testnet  # one vault per flat
export MARKET=market-v2.shedauser.testnet
export USDC=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
export PROJECT=lekki-garden-demo
export UNIT=1a
export INVESTOR=your-investor.testnet
export API=https://api-testnet.sheda.app/api/v1
export ADMIN_TOKEN=                       # an admin JWT for the testnet backend
```

`OWNER` must be a full-access key in the keychain. `USDC` is Circle's testnet
USDC, the same token the live demo uses.

Two helpers keep the commands short. Put them in the shell for the session:

```bash
call_as() {
  local signer=$1 contract=$2 method=$3 args=$4 deposit=${5:-1}
  near contract call-function as-transaction "$contract" "$method" \
    json-args "$args" prepaid-gas 100Tgas \
    attached-deposit "${deposit} yoctoNEAR" \
    sign-as "$signer" network-config testnet sign-with-keychain
}

deploy_with_init() {
  local signer=$1 account=$2 wasm=$3 init=$4 args=$5
  near contract deploy "$account" use-file "$wasm" with-init-call "$init" \
    json-args "$args" prepaid-gas 100Tgas attached-deposit "0 NEAR" \
    sign-as "$signer" network-config testnet sign-with-keychain
}
```

## 1. Create the accounts

Top-level testnet names are easiest; the faucet gives each new account
enough NEAR for storage and calls.

```bash
for account in "$RAISE" "$STAKE"; do
  near account create-account sponsor-by-faucet-service "$account" \
    autogenerate-new-keypair save-to-keychain \
    network-config testnet create
done
```

The vault is funded from `OWNER` so the same key does not have to be reused
across deployments:

```bash
near account create-account fund-myself "$VAULT" "10 NEAR" \
  autogenerate-new-keypair save-to-keychain \
  sign-as "$OWNER" network-config testnet sign-with-keychain
```

If you are deploying more than one flat, repeat the vault command with a
different account id for each unit. A vault belongs to exactly one flat.

## 2. Deploy the stake registry

The registry's controller is the raise contract. Deploy it first so the
raise can be initialised with its address.

```bash
deploy_with_init "$STAKE" "$STAKE" \
  contracts/target/wasm32-unknown-unknown/release/sheda_stake_registry.wasm \
  new "{\"stablecoin\":\"$USDC\",\"controller\":\"$RAISE\",\"owner\":\"$OWNER\"}"
```

## 3. Deploy the raise contract

```bash
deploy_with_init "$RAISE" "$RAISE" \
  contracts/target/wasm32-unknown-unknown/release/sheda_collection_raise.wasm \
  new "{\"owner\":\"$RAISE\",\"treasury\":\"$RAISE\",\"stake_registry\":\"$STAKE\"}"
```

The raise account is its own owner on testnet. That is acceptable for a
throwaway deployment and is not how a production contract should be set up.

## 4. Point the app at the new deployment

Either set the environment variables at build time:

```bash
NEXT_PUBLIC_RAISE_CONTRACT_ID=$RAISE
NEXT_PUBLIC_STAKE_REGISTRY_ID=$STAKE
```

or edit `apps/web/src/config/collections.ts` and replace the two testnet
ids. The env override exists so a deployment does not need a source edit.

Rebuild and redeploy the web app after changing either. The backend needs no
contract id: it never signs a raise call.

## 5. Create the raise on chain

The contract owner creates the project. Use exactly the same slug, phases,
unit codes, prices and target as the backend project, or the app will show
terms that do not match the escrow.

For a one-unit demo, target and price can both be 10 USDC
(10 000 000 atomic units):

```bash
ARGS=$(cat <<JSON
{
  "project_id": "$PROJECT",
  "builder": "adaeze-demo.shedauser.testnet",
  "manager": "ngozi-demo.shedauser.testnet",
  "stablecoin": "$USDC",
  "target": "10000000",
  "deadline_ns": "1800000000000000000",
  "platform_bps": 200,
  "guarantee_bps": 0,
  "phases": [["Piling and foundation", 2500], ["Structure", 4000], ["Finishing", 3500]],
  "units": [["$UNIT", "10000000", "10000"]]
}
JSON
)
# create_project is not payable. The helper defaults to 1 yocto, so pass 0.
call_as "$RAISE" "$RAISE" create_project "$ARGS" 0
```

`deadline_ns` is the funding deadline, not the construction deadline. Pick
a future value; the example is January 2027.

If the project is being created through the app instead, create the backend
draft first, then run this call as the contract owner, then publish the draft
with `escrow_account_id` set to `$RAISE`. The publish endpoint records the
escrow the app will send money to.

## 6. Deploy and register the flat's vault

The vault needs the marketplace token id of the unit it will hold. Read it
from the project record (`property_token_id`) or from the marketplace:

```bash
near view "$MARKET" get_property_by_id "{\"property_id\":\"<token-id>\"}"
```

Deploy the vault:

```bash
VAULT_ARGS=$(cat <<JSON
{
  "name": "Lekki Garden Demo 1A",
  "symbol": "LEK1A",
  "marketplace": "$MARKET",
  "property_id": "<token-id>",
  "stablecoin": "$USDC",
  "manager": "ngozi-demo.shedauser.testnet",
  "governor": "$RAISE",
  "treasury": "$RAISE",
  "manager_bps": 500,
  "reserve_bps": 500,
  "platform_bps": 200
}
JSON
)
deploy_with_init "$VAULT" "$VAULT" \
  contracts/target/wasm32-unknown-unknown/release/sheda_collection_vault.wasm \
  new "$VAULT_ARGS"
```

The governor must be the raise contract: it is the only account allowed to
mint shares. The fees are 5% manager, 5% reserve, 2% platform, well under
the contract's 30% ceiling.

Register the vault with the raise. This is the step the old deployment is
missing:

```bash
call_as "$RAISE" "$RAISE" set_unit_vault \
  "{\"project_id\":\"$PROJECT\",\"unit_code\":\"$UNIT\",\"vault\":\"$VAULT\"}"
```

Then tell the backend where it landed, so the app can show the claim button
instead of warning that no vault is recorded:

```bash
curl -X PATCH "$API/api/v1/collections/projects/$PROJECT/units/$UNIT/vault" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vault_account_id\":\"$VAULT\"}"
```

## 6b. Register every account that will hold the stablecoin

A NEP-141 token refuses to pay an account that has not registered with it,
and `ft_transfer_call` to an unregistered receiver bounces the money back to
the sender. Skip this and every commitment returns to the investor, the
vaults can never receive rent, and phase releases and fees cannot reach the
builder, manager or treasury. Register the raise, the stake registry, each
vault, the builder and the manager:

```bash
for account in "$RAISE" "$STAKE" "$VAULT" adaeze-demo.shedauser.testnet ngozi-demo.shedauser.testnet; do
  near contract call-function as-transaction "$USDC" storage_deposit     json-args "{\"account_id\":\"$account\"}" prepaid-gas 30Tgas     attached-deposit "0.00125 NEAR" sign-as "$account"     network-config testnet sign-with-keychain send
done
```

The testnet v2 deployment (2026-11-12) did this for all six contract
accounts and the three demo profiles.

## 7. Fund the raise and close it

The investor sends the stablecoin through `ft_transfer_call`, with the
project and unit in `msg`. The raise credits the commitment in the same
transaction.

```bash
MSG="{\"project\":\"$PROJECT\",\"unit\":\"$UNIT\"}"
ARGS=$(printf '{"receiver_id":"%s","amount":"10000000","memo":null,"msg":%s}' \
  "$RAISE" "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")

call_as "$INVESTOR" "$USDC" ft_transfer_call "$ARGS"
```

When the target is met, anyone can close the raise:

```bash
# close_raise is not payable, so pass 0 rather than the helper's default 1.
call_as "$INVESTOR" "$RAISE" close_raise "{\"project_id\":\"$PROJECT\"}" 0
```

## 8. Claim shares and verify

```bash
call_as "$INVESTOR" "$RAISE" claim_shares \
  "{\"project_id\":\"$PROJECT\",\"unit\":\"$UNIT\"}"
```

The vault mints the shares. Confirm both sides:

```bash
near view "$RAISE" shares_owed \
  "{\"project_id\":\"$PROJECT\",\"unit\":\"$UNIT\",\"account_id\":\"$INVESTOR\"}"
near view "$VAULT" ft_balance_of "{\"account_id\":\"$INVESTOR\"}"
```

`shares_owed` falls to zero after a successful claim; `ft_balance_of` shows
the minted shares. From then on the position is in Holdings and rent paid to
the vault accrues to it.

## 9. Rebuild the ranks

The indexer reads the raises and stake from the chain and writes the cached
counts the client turns into a rank. Run it with the API's database
environment:

```bash
cd services/backend
RAISE_CONTRACT_ID=$RAISE STAKE_REGISTRY_ID=$STAKE \
  uv run python scripts/sync_collections_chain.py --dry-run
RAISE_CONTRACT_ID=$RAISE STAKE_REGISTRY_ID=$STAKE \
  uv run python scripts/sync_collections_chain.py
```

A builder needs two finished raises before the directory shows a score. A
manager also needs at least one indexed rent period, because occupancy and
on-time rent are most of that score. The script leaves those fields at zero
until the lease and vault event pipeline exists rather than treating missing
data as a bad record.

## What this does not do

- It does not deploy the marketplace. That is already live at
  `market-v2.shedauser.testnet`.
- It does not mint the property NFT. The vault can only accept a token that
  exists and whose id matches the one in its initialisation arguments.
- It does not move an existing project's escrow. Publish a new project
  against the new raise account; the old deployment remains readable in the
  backend but will not fund.
