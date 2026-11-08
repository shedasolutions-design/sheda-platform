import { Linking } from "react-native";

export type ExplorerNetwork = "testnet" | "mainnet";

// NEAR's own explorer (explorer.near.org / explorer.testnet.near.org) was
// retired and now just redirects, so links built against it either dead-end
// or land on an unrelated page. NearBlocks is the live explorer for both
// networks — and it's already the indexer this app reads transactions from
// (services/nearIndexer.ts), so a hash we display always resolves there.
const EXPLORER_URLS: Record<ExplorerNetwork, string> = {
    testnet: "https://testnet.nearblocks.io",
    mainnet: "https://nearblocks.io",
};

// The network the app is currently connected to. Explorer links have to
// follow it — a testnet hash opened on the mainnet explorer renders a
// "transaction not found" page, which reads to users as a lost transaction.
// WalletContext keeps this in sync via setExplorerNetwork.
let activeNetwork: ExplorerNetwork = "testnet";

export const setExplorerNetwork = (network: ExplorerNetwork): void => {
    activeNetwork = network;
};

export const getExplorerNetwork = (): ExplorerNetwork => activeNetwork;

/**
 * Get the explorer URL for a transaction (for display without opening).
 */
export const getTxExplorerUrl = (
    txHash: string,
    network: ExplorerNetwork = activeNetwork
) => `${EXPLORER_URLS[network]}/txns/${txHash}`;

/**
 * Get the explorer URL for an account.
 */
export const getAccountExplorerUrl = (
    accountId: string,
    network: ExplorerNetwork = activeNetwork
) => `${EXPLORER_URLS[network]}/address/${accountId}`;

/**
 * Open a transaction on the block explorer.
 */
export const openTxOnExplorer = (
    txHash: string,
    network: ExplorerNetwork = activeNetwork
) => Linking.openURL(getTxExplorerUrl(txHash, network));

/**
 * Open an account page on the block explorer.
 */
export const openAccountOnExplorer = (
    accountId: string,
    network: ExplorerNetwork = activeNetwork
) => Linking.openURL(getAccountExplorerUrl(accountId, network));
