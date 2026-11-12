/**
 * NEAR Indexer Service
 *
 * Queries NEAR blockchain transaction history using the NEARBlocks API (v3).
 *
 * NEARBlocks retired API v1 on testnet on 2026-11-05 (every call answers
 * 410 Gone) and switches it off on mainnet on 2026-11-22. v3 differs in
 * three ways that matter here: paths are /v3/accounts/{id}/..., results
 * sit under `data`, and list rows no longer carry action `args`, so a token
 * transfer's amount has to be read from the transaction's own detail.
 */

import AsyncStorage from "@/lib/storage";
import { getTokenSymbol } from '@/config/tokens';
import { parseAtomicAmount, formatAmount } from '@/utilities/atomicAmount';
import { ACTIVE_NETWORK } from '@/config/near';

/** Most token-transfer rows whose amount we look up per load. */
const MAX_DETAIL_LOOKUPS = 10;

// Types for NEAR indexer responses
export interface IndexedTransaction {
  transaction_hash: string;
  included_in_block_hash: string;
  block_timestamp: string;
  signer_account_id: string;
  receiver_account_id: string;
  actions: IndexedAction[];
  status: 'SUCCESS' | 'FAILURE';
}

export interface IndexedAction {
  action: string;
  method?: string;
  args?: any;
  deposit?: string;
  gas?: string;
}

export interface ParsedTransaction {
  id: string;
  hash: string;
  type: 'Transfer' | 'Token Transfer' | 'Function Call' | 'Stake' | 'Other';
  direction: 'incoming' | 'outgoing';
  from: string;
  to: string;
  amount: string;
  currency: string;
  timestamp: number;
  date: string;
  status: 'completed' | 'failed';
  blockHash: string;
  methodName?: string;
  deposit?: string;
  gas?: string;
}

export interface IndexerConfig {
  baseUrl: string;
  cacheEnabled: boolean;
  cacheTTL: number; // milliseconds
  pageSize: number;
}

export interface TransactionQuery {
  accountId: string;
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  /**
   * Skip the 5-minute cache and go straight to the indexer. Pull-to-refresh
   * sets this — otherwise a user who just signed a transaction pulls to
   * refresh and keeps getting served the pre-transaction cache for 5 minutes,
   * which looks exactly like the transaction never landed.
   */
  forceRefresh?: boolean;
}

/**
 * Thrown when the indexer can't be reached AND there's no cache to fall back
 * on. Callers must not translate this into an empty list: "we couldn't read
 * your history" and "you have no history" look identical to a user, and only
 * one of them is recoverable by waiting.
 */
export class IndexerUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'IndexerUnavailableError';
  }
}

// Human-readable labels for the contract methods this app calls. Shared with
// the UI so a method only has to be named once.
export const METHOD_LABELS: Record<string, string> = {
  mint_property: 'List Property',
  place_property: 'List Property',
  delete_property: 'Delete Property',
  delist_property: 'Delist Property',
  accept_bid: 'Accept Bid',
  accept_bid_with_escrow: 'Accept Bid',
  reject_bid: 'Reject Bid',
  cancel_bid: 'Cancel Bid',
  place_bid: 'Place Bid',
  claim_lost_bid: 'Claim Refund',
  ft_transfer_call: 'Token Transfer',
  ft_transfer: 'Token Transfer',
  commit_payment: 'Commit Payment',
  release_payment: 'Release Payment',
  release_escrow: 'Release Escrow',
  release_document: 'Release Document',
  confirm_document_receipt: 'Confirm Documents',
  raise_dispute: 'Raise Dispute',
  resolve_dispute: 'Resolve Dispute',
  expire_lease: 'Expire Lease',
  renew_lease: 'Renew Lease',
  end_lease: 'End Lease',
  nft_transfer: 'NFT Transfer',
  nft_mint: 'Mint NFT',
  storage_deposit: 'Storage Deposit',
};

/** Display label for a contract method, or undefined if we don't know it. */
export function getMethodLabel(methodName?: string): string | undefined {
  if (!methodName) return undefined;
  return METHOD_LABELS[methodName];
}

/**
 * NEAR Indexer Service Class
 */
export class NearIndexerService {
  private config: IndexerConfig;
  private cache: Map<string, { data: ParsedTransaction[]; timestamp: number }>;

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.config = {
      baseUrl:
        network === 'testnet'
          ? 'https://api-testnet.nearblocks.io/v3'
          : 'https://api.nearblocks.io/v3',
      cacheEnabled: true,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      pageSize: 25,
    };

    this.cache = new Map();
  }

  /**
   * Get account transactions from NEAR blockchain
   */
  async getAccountTransactions(
    query: TransactionQuery
  ): Promise<ParsedTransaction[]> {
    const { accountId, page = 1, limit = 25, order = 'desc', forceRefresh = false } = query;

    // Check cache first
    if (this.config.cacheEnabled && !forceRefresh) {
      const cached = await this.getCachedTransactions(accountId);
      if (cached && cached.length > 0) {
        console.log('[NearIndexer] Returning cached transactions');
        return this.paginateTransactions(cached, page, limit);
      }
    }

    try {
      console.log(`[NearIndexer] Fetching transactions for ${accountId}`);

      // Query NEARBlocks API
      // v3 has no page numbers (cursor paging, newest first), so read one
      // page of up to 100 and slice locally; the screens only show the latest.
      void order;
      const url = `${this.config.baseUrl}/accounts/${encodeURIComponent(accountId)}/txns?limit=${Math.min(100, Math.max(1, page * limit))}`;
      console.log(`[NearIndexer] API URL: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[NearIndexer] API error: ${response.status} ${response.statusText}`);
        throw new Error(`Indexer API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[NearIndexer] API response:`, JSON.stringify(data).substring(0, 200));

      // Parse NEARBlocks response
      const transactions = this.parseNEARBlocksResponse(data, accountId);
      await this.fillTokenAmounts(transactions);

      console.log(`[NearIndexer] Parsed ${transactions.length} transactions`);

      // Cache the results
      if (this.config.cacheEnabled && transactions.length > 0) {
        await this.cacheTransactions(accountId, transactions);
      }

      return this.paginateTransactions(transactions, page, limit);
    } catch (error) {
      console.error('[NearIndexer] Error fetching transactions:', error);

      // Try to return cached data even if expired
      const cached = await this.getCachedTransactions(accountId, true);
      if (cached && cached.length > 0) {
        console.log('[NearIndexer] Returning stale cache due to error');
        return this.paginateTransactions(cached, page, limit);
      }

      // Nothing to show and no idea whether the account has history — say so.
      // Swallowing this into [] rendered a confident "No transactions found"
      // whenever the indexer hiccuped, which is indistinguishable from data
      // loss to whoever just paid for a transaction.
      throw new IndexerUnavailableError(
        'Could not reach the blockchain indexer',
        error
      );
    }
  }

  /**
   * Get transaction details by hash
   */
  async getTransactionDetails(txHash: string): Promise<ParsedTransaction | null> {
    try {
      console.log(`[NearIndexer] Fetching transaction details for ${txHash}`);

      const url = `${this.config.baseUrl}/txns/${txHash}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Indexer API error: ${response.status}`);
      }

      const data = await response.json();
      const rawTx = Array.isArray(data?.data) ? data.data[0] : data?.data;
      if (!rawTx) return null;
      return this.parseTransaction(rawTx, rawTx.signer_account_id);
    } catch (error) {
      console.error('[NearIndexer] Error fetching transaction details:', error);
      return null;
    }
  }

  /**
   * Parse NEARBlocks API response
   * NEARBlocks returns multiple receipts per transaction hash.
   * We deduplicate by hash, preferring FUNCTION_CALL over TRANSFER receipts.
   */
  private parseNEARBlocksResponse(
    response: any,
    accountId: string
  ): ParsedTransaction[] {
    console.log('[NearIndexer] Response keys:', Object.keys(response || {}));

    let txnsArray: any[] = [];

    if (Array.isArray(response?.data)) {
      txnsArray = response.data;
    } else if (response?.txns && Array.isArray(response.txns)) {
      txnsArray = response.txns;
    } else if (response?.transactions && Array.isArray(response.transactions)) {
      txnsArray = response.transactions;
    } else if (Array.isArray(response)) {
      txnsArray = response;
    } else {
      console.warn('[NearIndexer] Invalid response format - expected txns array');
      return [];
    }

    console.log(`[NearIndexer] Found ${txnsArray.length} raw receipts`);

    // Deduplicate: group by transaction_hash, prefer FUNCTION_CALL over TRANSFER
    const txByHash = new Map<string, any>();
    for (const tx of txnsArray) {
      const hash = tx.transaction_hash || tx.hash;
      if (!hash) continue;

      const existing = txByHash.get(hash);
      const actionType = tx.actions?.[0]?.action || '';

      if (!existing) {
        txByHash.set(hash, tx);
      } else {
        // Prefer FUNCTION_CALL over TRANSFER (transfers are often just refunds)
        const existingActionType = existing.actions?.[0]?.action || '';
        if (actionType === 'FUNCTION_CALL' && existingActionType !== 'FUNCTION_CALL') {
          txByHash.set(hash, tx);
        }
      }
    }

    console.log(`[NearIndexer] Deduplicated to ${txByHash.size} unique transactions`);

    const parsed = Array.from(txByHash.values())
      .map((tx) => this.parseTransaction(tx, accountId))
      .filter((tx): tx is ParsedTransaction => tx !== null);

    console.log(`[NearIndexer] Successfully parsed ${parsed.length} transactions`);
    return parsed;
  }

  /**
   * Parse a single transaction
   */
  private parseTransaction(
    rawTx: any,
    accountId: string
  ): ParsedTransaction | null {
    try {
      const hash = rawTx.transaction_hash || rawTx.hash;
      const from = rawTx.signer_account_id || accountId;
      const to = rawTx.receiver_account_id || '';
      const timestampNano = rawTx.block_timestamp;
      const timestamp = Math.floor(timestampNano / 1000000); // nanoseconds → milliseconds

      const { type, amount, currency, methodName, deposit, gas } =
        this.parseActions(rawTx.actions || [], to, rawTx.actions_agg?.deposit);

      // Determine direction based on action type
      let direction: 'incoming' | 'outgoing';
      if (methodName) {
        // For contract calls, check the method name
        const incomingMethods = ['accept_bid', 'release_payment', 'claim_lost_bid'];
        const outgoingMethods = ['mint_property', 'place_bid', 'ft_transfer_call', 'ft_transfer', 'commit_payment', 'reject_bid', 'cancel_bid'];
        if (incomingMethods.includes(methodName)) {
          direction = 'incoming';
        } else if (outgoingMethods.includes(methodName)) {
          direction = 'outgoing';
        } else {
          direction = to === accountId ? 'incoming' : 'outgoing';
        }
      } else {
        direction = to === accountId ? 'incoming' : 'outgoing';
      }

      // Parse status
      const status: 'completed' | 'failed' =
        rawTx.outcomes?.status === true ||
        rawTx.status === 'SUCCESS_VALUE' ||
        rawTx.status === 'SUCCESS'
          ? 'completed'
          : 'failed';

      return {
        id: hash,
        hash,
        type,
        direction,
        from,
        to,
        amount,
        currency,
        timestamp,
        date: new Date(timestamp).toISOString(),
        status,
        blockHash: rawTx.block?.block_hash || rawTx.included_in_block_hash || rawTx.block_hash || '',
        methodName,
        deposit,
        gas,
      };
    } catch (error) {
      console.error('[NearIndexer] Error parsing transaction:', error);
      return null;
    }
  }

  /**
   * Parse transaction actions to determine type and amount
   */
  private parseActions(
    actions: any[],
    /** Account the call was made against — the FT contract for ft_transfer */
    contractId = '',
    /** v3 list rows put the attached deposit here instead of on the action */
    aggDeposit?: string
  ): {
    type: ParsedTransaction['type'];
    amount: string;
    currency: string;
    methodName?: string;
    deposit?: string;
    gas?: string;
  } {
    if (!actions || actions.length === 0) {
      return { type: 'Other', amount: '0', currency: 'NEAR' };
    }

    const firstAction = actions[0];
    const actionType = firstAction.action || firstAction.action_kind;

    switch (actionType) {
      case 'TRANSFER':
      case 'Transfer': {
        const depositAmount = firstAction.deposit ||
                             firstAction.args?.deposit ||
                             firstAction.args?.amount ||
                             aggDeposit ||
                             0;

        return {
          type: 'Transfer',
          amount: this.formatNEAR(depositAmount),
          currency: 'NEAR',
        };
      }

      case 'FUNCTION_CALL':
      case 'FunctionCall': {
        const methodName = firstAction.method || firstAction.args?.method_name || '';
        const deposit = firstAction.deposit || firstAction.args?.deposit || aggDeposit || 0;
        const gas = firstAction.args?.gas;

        // Check if it's a token transfer
        if (methodName === 'ft_transfer' || methodName === 'ft_transfer_call') {
          // The token is the contract the call was made against, NOT
          // args.receiver_id — that's the account being paid, so sniffing it
          // for "usdc"/"usdt" labelled almost every transfer as the generic
          // "Token" and mis-scaled anything that isn't 6 decimals.
          let tokenAmount = '0';
          const tokenCurrency = getTokenSymbol(contractId);
          try {
            const raw = typeof firstAction.args === 'string'
              ? JSON.parse(firstAction.args)
              : firstAction.args;
            // v3 detail nests the call's own arguments under args_json.
            const args = raw?.args_json ?? raw;
            if (args?.amount) {
              const parsed = parseAtomicAmount(args.amount, contractId);
              if (parsed) tokenAmount = formatAmount(parsed.amount);
            }
          } catch {
            // Best-effort display parsing only — fall back to the '0' default above.
          }

          return {
            type: 'Token Transfer',
            amount: tokenAmount,
            currency: tokenCurrency,
            methodName,
            deposit: this.formatNEAR(deposit),
            gas: gas ? String(gas) : undefined,
          };
        }

        return {
          type: 'Function Call',
          amount: this.formatNEAR(deposit),
          currency: 'NEAR',
          methodName,
          deposit: this.formatNEAR(deposit),
          gas: gas ? String(gas) : undefined,
        };
      }

      case 'STAKE':
      case 'Stake': {
        const stakeAmount = firstAction.stake || firstAction.args?.stake || 0;
        return {
          type: 'Stake',
          amount: this.formatNEAR(stakeAmount),
          currency: 'NEAR',
        };
      }

      default:
        return {
          type: 'Other',
          amount: '0',
          currency: 'NEAR',
        };
    }
  }

  /**
   * v3 list rows omit action args, so a token transfer arrives with amount
   * "0". Read the few most recent ones from the transaction detail, which
   * still carries them. Best effort: a failed lookup leaves the row as is.
   */
  private async fillTokenAmounts(transactions: ParsedTransaction[]): Promise<void> {
    const todo = transactions
      .filter((t) => t.type === 'Token Transfer' && (!t.amount || t.amount === '0'))
      .slice(0, MAX_DETAIL_LOOKUPS);
    await Promise.all(
      todo.map(async (t) => {
        const detail = await this.getTransactionDetails(t.hash);
        if (detail && detail.amount && detail.amount !== '0') {
          t.amount = detail.amount;
          t.currency = detail.currency;
        }
      })
    );
  }

  /**
   * Format yoctoNEAR to NEAR with smart decimal places
   */
  private formatNEAR(yoctoNEAR: string | number): string {
    try {
      // Handle scientific notation from API (e.g., 5e+23)
      let yoctoString: string;
      if (typeof yoctoNEAR === 'number') {
        // Convert scientific notation to string without losing precision
        yoctoString = yoctoNEAR.toLocaleString('en-US', {
          useGrouping: false,
          maximumFractionDigits: 0
        });
      } else {
        yoctoString = yoctoNEAR;
      }

      const amount = BigInt(yoctoString);
      const near = Number(amount) / 1e24;

      // Handle zero
      if (near === 0) {
        return '0';
      }

      // For very small amounts, show more decimals
      if (near < 0.0001) {
        // Show up to 8 decimals for very small amounts
        return near.toFixed(8).replace(/\.?0+$/, '');
      }

      // For small amounts, show 6 decimals
      if (near < 1) {
        return near.toFixed(6).replace(/\.?0+$/, '');
      }

      // For regular amounts, show 4 decimals
      return near.toFixed(4).replace(/\.?0+$/, '');
    } catch (error) {
      console.error('[NearIndexer] Error formatting NEAR:', error);
      return '0';
    }
  }

  /**
   * Paginate transactions array
   */
  private paginateTransactions(
    transactions: ParsedTransaction[],
    page: number,
    limit: number
  ): ParsedTransaction[] {
    const start = (page - 1) * limit;
    const end = start + limit;
    return transactions.slice(start, end);
  }

  /**
   * Get cached transactions
   */
  private async getCachedTransactions(
    accountId: string,
    ignoreExpiry = false
  ): Promise<ParsedTransaction[] | null> {
    try {
      // Check in-memory cache first
      const memCache = this.cache.get(accountId);
      if (memCache) {
        const isExpired = Date.now() - memCache.timestamp > this.config.cacheTTL;
        if (!isExpired || ignoreExpiry) {
          return memCache.data;
        }
      }

      // Check AsyncStorage
      const key = `near_txs_${accountId}`;
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        const isExpired = Date.now() - parsed.timestamp > this.config.cacheTTL;

        if (!isExpired || ignoreExpiry) {
          // Update in-memory cache
          this.cache.set(accountId, parsed);
          return parsed.data;
        }
      }

      return null;
    } catch (error) {
      console.error('[NearIndexer] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Cache transactions
   */
  private async cacheTransactions(
    accountId: string,
    transactions: ParsedTransaction[]
  ): Promise<void> {
    try {
      const cacheData = {
        data: transactions,
        timestamp: Date.now(),
      };

      // Update in-memory cache
      this.cache.set(accountId, cacheData);

      // Update AsyncStorage
      const key = `near_txs_${accountId}`;
      await AsyncStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error('[NearIndexer] Error writing cache:', error);
    }
  }

  /**
   * Clear cache for account
   */
  async clearCache(accountId?: string): Promise<void> {
    try {
      if (accountId) {
        // Clear specific account
        this.cache.delete(accountId);
        const key = `near_txs_${accountId}`;
        await AsyncStorage.removeItem(key);
      } else {
        // Clear all
        this.cache.clear();
        const keys = await AsyncStorage.getAllKeys();
        const txKeys = keys.filter(k => k.startsWith('near_txs_'));
        await AsyncStorage.multiRemove(txKeys);
      }
    } catch (error) {
      console.error('[NearIndexer] Error clearing cache:', error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IndexerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export singleton instance
export const nearIndexer = new NearIndexerService(ACTIVE_NETWORK);
