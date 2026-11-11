/**
 * Token Registry Service
 *
 * Manages verified FT (Fungible Token) contracts and their metadata
 * Provides caching and validation for token queries
 */

import AsyncStorage from "@/lib/storage";
import { Account } from '@near-js/accounts';

export interface TokenMetadata {
  contractId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  verified: boolean;
  spec?: string;
}

export interface TokenBalance {
  contractId: string;
  balance: string;
  symbol: string;
  decimals: number;
  balanceFormatted: string;
  usdValue?: number;
}

/**
 * Token Registry Service Class
 */
export class TokenRegistryService {
  private network: 'testnet' | 'mainnet';
  private metadataCache: Map<string, { data: TokenMetadata; timestamp: number }>;
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  // Verified testnet tokens
  // Source of truth: shedasolution.testnet → supported_stablecoins()
  // Last verified on-chain: 2026-03-02
  private testnetTokens: TokenMetadata[] = [
    {
      contractId: 'usdt.fakes.testnet',
      symbol: 'USDT',
      name: 'USDT (Testnet)',
      decimals: 6,
      verified: true,
    },
    {
      contractId: 'usdc.fakes.testnet',
      symbol: 'USDC',
      name: 'USDC (Testnet)',
      decimals: 6,
      verified: true,
    },
    {
      // Circle's official USDC on NEAR testnet (implicit account)
      contractId: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
      symbol: 'USDC',
      name: 'USDC (Circle)',
      decimals: 6,
      verified: true,
    },
    {
      contractId: 'wrap.testnet',
      symbol: 'wNEAR',
      name: 'Wrapped NEAR (Testnet)',
      decimals: 24,
      verified: true,
    },
  ];

  // Verified mainnet tokens
  private mainnetTokens: TokenMetadata[] = [
    {
      contractId: 'usdt.tether-token.near',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      verified: true,
    },
    {
      contractId: 'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near',
      symbol: 'USDT.e',
      name: 'Tether USD (Ethereum)',
      decimals: 6,
      verified: true,
    },
    {
      contractId: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      verified: true,
    },
    {
      contractId: 'wrap.near',
      symbol: 'wNEAR',
      name: 'Wrapped NEAR',
      decimals: 24,
      verified: true,
    },
  ];

  constructor(network: 'testnet' | 'mainnet' = 'testnet') {
    this.network = network;
    this.metadataCache = new Map();
  }

  /**
   * Get all verified tokens for current network
   */
  getAllVerifiedTokens(): TokenMetadata[] {
    return this.network === 'testnet' ? this.testnetTokens : this.mainnetTokens;
  }

  /**
   * Get token metadata (cached or fetched)
   */
  async getTokenMetadata(contractId: string): Promise<TokenMetadata | null> {
    try {
      // Check cache first
      const cached = this.getCachedMetadata(contractId);
      if (cached) {
        return cached;
      }

      // Check if it's a verified token
      const verified = this.getAllVerifiedTokens().find(
        t => t.contractId === contractId
      );
      if (verified) {
        this.cacheMetadata(contractId, verified);
        return verified;
      }

      // Query contract for metadata (requires NEAR account)
      console.log(`[TokenRegistry] Fetching metadata for ${contractId}`);
      return null; // Will be implemented with contract calls
    } catch (error) {
      console.error('[TokenRegistry] Error getting token metadata:', error);
      return null;
    }
  }

  /**
   * Query token balance for an account
   */
  async getTokenBalance(
    contractId: string,
    accountId: string,
    account: Account
  ): Promise<TokenBalance | null> {
    try {
      // Get metadata first
      const metadata = await this.getTokenMetadata(contractId);
      if (!metadata) {
        return null;
      }

      // Query balance using ft_balance_of
      const balance = await account.viewFunction({
        contractId,
        methodName: 'ft_balance_of',
        args: { account_id: accountId },
      });

      if (!balance) {
        return null;
      }

      // Format balance
      const balanceFormatted = this.formatTokenBalance(
        balance,
        metadata.decimals
      );

      return {
        contractId,
        balance,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        balanceFormatted,
      };
    } catch (error: any) {
      // Silently ignore contract not found errors (common on testnet)
      if (error?.message?.includes('Cannot find contract code') ||
        error?.message?.includes('does not exist')) {
        return null;
      }

      // Log other unexpected errors
      console.error(
        `[TokenRegistry] Error getting balance for ${contractId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Query balances for all verified tokens
   */
  async getAllTokenBalances(
    accountId: string,
    account: Account
  ): Promise<TokenBalance[]> {
    const tokens = this.getAllVerifiedTokens();
    console.log(`[TokenRegistry] Querying balances for ${tokens.length} tokens`);

    // Query all tokens in parallel
    const results = await Promise.allSettled(
      tokens.map(token =>
        this.getTokenBalance(token.contractId, accountId, account)
      )
    );

    // Include ALL whitelisted tokens — even those with zero balance
    const balances: TokenBalance[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value) {
        balances.push(result.value);
      } else {
        // Token query failed or returned null — still include with zero balance
        const token = tokens[i];
        balances.push({
          contractId: token.contractId,
          balance: '0',
          symbol: token.symbol,
          decimals: token.decimals,
          balanceFormatted: '0.00',
        });
      }
    }

    return balances;
  }

  /**
   * Query token metadata from contract
   */
  async queryContractMetadata(
    contractId: string,
    account: Account
  ): Promise<TokenMetadata | null> {
    try {
      console.log(`[TokenRegistry] Querying metadata for ${contractId}`);

      const metadata = await account.viewFunction({
        contractId,
        methodName: 'ft_metadata',
        args: {},
      });

      if (!metadata) {
        return null;
      }

      const tokenMetadata: TokenMetadata = {
        contractId,
        symbol: metadata.symbol || 'UNKNOWN',
        name: metadata.name || 'Unknown Token',
        decimals: metadata.decimals || 18,
        icon: metadata.icon,
        verified: false,
        spec: metadata.spec,
      };

      // Cache the metadata
      this.cacheMetadata(contractId, tokenMetadata);

      return tokenMetadata;
    } catch (error) {
      console.error(
        `[TokenRegistry] Error querying metadata for ${contractId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Add custom token to registry
   */
  async addCustomToken(
    contractId: string,
    account: Account
  ): Promise<TokenMetadata | null> {
    try {
      // Check if already in verified list
      const existing = this.getAllVerifiedTokens().find(
        t => t.contractId === contractId
      );
      if (existing) {
        return existing;
      }

      // Query metadata from contract
      const metadata = await this.queryContractMetadata(contractId, account);
      if (!metadata) {
        throw new Error('Failed to fetch token metadata');
      }

      // Store in AsyncStorage custom tokens list
      await this.saveCustomToken(metadata);

      return metadata;
    } catch (error) {
      console.error('[TokenRegistry] Error adding custom token:', error);
      return null;
    }
  }

  /**
   * Get all custom tokens
   */
  async getCustomTokens(): Promise<TokenMetadata[]> {
    try {
      const key = `custom_tokens_${this.network}`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
      return [];
    } catch (error) {
      console.error('[TokenRegistry] Error reading custom tokens:', error);
      return [];
    }
  }

  /**
   * Save custom token
   */
  private async saveCustomToken(token: TokenMetadata): Promise<void> {
    try {
      const customTokens = await this.getCustomTokens();
      const exists = customTokens.find(t => t.contractId === token.contractId);

      if (!exists) {
        customTokens.push(token);
        const key = `custom_tokens_${this.network}`;
        await AsyncStorage.setItem(key, JSON.stringify(customTokens));
      }
    } catch (error) {
      console.error('[TokenRegistry] Error saving custom token:', error);
    }
  }

  /**
   * Format token balance
   */
  private formatTokenBalance(balance: string, decimals: number): string {
    try {
      const amount = BigInt(balance);
      const divisor = BigInt(10 ** decimals);
      const wholePart = amount / divisor;
      const fractionalPart = amount % divisor;

      // Format with appropriate decimal places
      const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
      const formattedFractional = fractionalStr.slice(0, 6); // Show up to 6 decimals

      return `${wholePart}.${formattedFractional}`.replace(/\.?0+$/, '');
    } catch {
      return '0';
    }
  }

  /**
   * Get cached metadata
   */
  private getCachedMetadata(contractId: string): TokenMetadata | null {
    const cached = this.metadataCache.get(contractId);
    if (cached) {
      const isExpired = Date.now() - cached.timestamp > this.cacheTTL;
      if (!isExpired) {
        return cached.data;
      }
    }
    return null;
  }

  /**
   * Cache metadata
   */
  private cacheMetadata(contractId: string, metadata: TokenMetadata): void {
    this.metadataCache.set(contractId, {
      data: metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear metadata cache
   */
  clearCache(contractId?: string): void {
    if (contractId) {
      this.metadataCache.delete(contractId);
    } else {
      this.metadataCache.clear();
    }
  }

  /**
   * Check if token is verified
   */
  isVerified(contractId: string): boolean {
    return this.getAllVerifiedTokens().some(t => t.contractId === contractId);
  }

  /**
   * Switch network
   */
  switchNetwork(network: 'testnet' | 'mainnet'): void {
    this.network = network;
    this.clearCache();
  }
}

// Export singleton instances
export const testnetTokenRegistry = new TokenRegistryService('testnet');
export const mainnetTokenRegistry = new TokenRegistryService('mainnet');
