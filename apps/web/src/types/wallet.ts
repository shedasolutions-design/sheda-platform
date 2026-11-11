export interface Token {
  id: string
  name: string
  symbol: string
  price: number
  amount: number
  totalValue: number
  icon: any
  iconColor: string
  contractAddress?: string
  decimals?: number
  /** True if this token's price was successfully fetched from the oracle */
  priceAvailable?: boolean
}

/**
 * On-chain state of a property NFT, as reported by the contract right now.
 * Drives the badge on each asset card so a delisted or sold property never
 * keeps advertising itself as "for sale".
 */
export type AssetState =
  | "listed"    // is_for_sale — accepting bids
  | "unlisted"  // minted/owned but delisted
  | "leased"    // has an active lease
  | "sold"      // sale recorded on-chain
  | "bid"       // not owned by the user; they have a bid against it

export type AssetViewMode = "grid" | "list"

export interface Asset {
  id: string
  name: string
  status: "Ongoing" | "Completed"
  image: any
  imageUri?: string
  description?: string
  /** Raw on-chain price, in atomic units of `priceToken` */
  price?: string
  /** Contract address of the stablecoin the price is denominated in */
  priceToken?: string
  /** Human-readable price, e.g. 1500 for "1500000000" USDC */
  priceAmount?: number
  /** Ticker for `priceAmount`, e.g. "USDC" */
  priceSymbol?: string
  /** USD value of the price where derivable (stablecoins), else null */
  priceUsd?: number | null
  owner?: string
  propertyId?: number
  /** Current on-chain state — see AssetState */
  state?: AssetState
  /** Human label for `state`, e.g. "Listed for sale" */
  stateLabel?: string
  /** True when the connected account owns the underlying NFT */
  owned?: boolean
  /** Block timestamp (ms) the property was minted */
  mintedAt?: number
}

export interface Transaction {
  id: string
  type: "Transfer" | "Token Transfer" | "Function Call" | "Stake" | "Swap" | "Other"
  direction: "incoming" | "outgoing"
  from?: string
  to?: string
  amount: number | string  // String to preserve decimal precision for display
  currency: string
  value: number
  date: string
  hash?: string
  status?: "completed" | "failed" | "pending"
  timestamp?: number
  blockHash?: string
  methodName?: string
  deposit?: string
  gas?: string
}

export type WalletTab = "Tokens" | "Transactions" | "Assets"

// ── Total Balance Aggregation ──

export interface AggregatedBalance {
  /** Sum of all token balances converted to USD */
  totalUsd: number
  /** True if all token prices are available */
  isComplete: boolean
  /** Number of tokens missing price data */
  missingPriceCount: number
  /** Symbols of tokens missing price data */
  missingPriceSymbols: string[]
}

/**
 * Compute the aggregated total balance across all tokens.
 * Tokens without a price are excluded from the total and flagged.
 */
export function computeAggregatedBalance(tokens: Token[]): AggregatedBalance {
  let totalUsd = 0
  const missingPriceSymbols: string[] = []

  for (const token of tokens) {
    if (token.priceAvailable === false || (token.price === 0 && token.symbol !== "NEAR")) {
      // Price not available — skip from total but flag it
      if (token.amount > 0) {
        missingPriceSymbols.push(token.symbol)
      }
    } else {
      totalUsd += token.totalValue
    }
  }

  return {
    totalUsd,
    isComplete: missingPriceSymbols.length === 0,
    missingPriceCount: missingPriceSymbols.length,
    missingPriceSymbols,
  }
}
