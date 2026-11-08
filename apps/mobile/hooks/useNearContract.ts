import { useState, useCallback, useEffect } from "react";
import nearContractService, { NetworkType } from "../services/nearContract";
import { useWallet } from "../contexts/WalletContext";
import {
  PropertyView,
  BidView,
  LeaseView,
  MintPropertyParams,
  AcceptBidParams,
  RejectBidParams,
  CancelBidParams,
  TransferPropertyParams,
  UpdateListingParams,
  GetPropertiesParams,
  ContractCallResult,
  Action,
} from "../types/contract";

export interface UseNearContractReturn {
  // State
  loading: boolean;
  error: string | null;
  lastTransaction: string | null;

  // Property Management
  mintProperty: (
    params: MintPropertyParams
  ) => Promise<ContractCallResult<number>>;
  getProperties: (
    params: GetPropertiesParams
  ) => Promise<ContractCallResult<PropertyView[]>>;
  getPropertyById: (
    id: number
  ) => Promise<ContractCallResult<PropertyView | null>>;
  getMyProperties: () => Promise<ContractCallResult<PropertyView[]>>;
  deleteProperty: (id: number) => Promise<ContractCallResult<void>>;
  delistProperty: (id: number) => Promise<ContractCallResult<void>>;
  updateListing: (params: UpdateListingParams) => Promise<ContractCallResult<void>>;
  transferProperty: (
    params: TransferPropertyParams
  ) => Promise<ContractCallResult<void>>;

  // Bidding
  acceptBid: (params: AcceptBidParams) => Promise<ContractCallResult<void>>;
  acceptBidWithEscrow: (params: AcceptBidParams) => Promise<ContractCallResult<void>>;
  rejectBid: (params: RejectBidParams) => Promise<ContractCallResult<void>>;
  cancelBid: (params: CancelBidParams) => Promise<ContractCallResult<void>>;
  claimLostBid: (params: { bid_id: number; property_id: number }) => Promise<ContractCallResult<void>>;
  placeBid: (
    tokenContractId: string,
    propertyId: number,
    amount: string,
    action: Action
  ) => Promise<ContractCallResult<number>>;
  getBidsForProperty: (propertyId: number) => Promise<ContractCallResult<BidView[]>>;
  getMyBids: (accountId: string) => Promise<ContractCallResult<BidView[]>>;

  // Leasing
  getLeaseById: (
    leaseId: number
  ) => Promise<ContractCallResult<LeaseView | null>>;
  raiseDispute: (params: { bid_id: number; property_id: number; reason: string }) => Promise<ContractCallResult<void>>;
  expireLease: (leaseId: number) => Promise<ContractCallResult<void>>;

  // Escrow Lifecycle
  confirmDocumentRelease: (
    params: { bid_id: number; property_id: number; document_image_uri: string; document_description: string }
  ) => Promise<ContractCallResult<void>>;
  confirmDocumentReceipt: (
    params: { bid_id: number; property_id: number }
  ) => Promise<ContractCallResult<void>>;
  releaseEscrow: (
    params: { bid_id: number; property_id: number }
  ) => Promise<ContractCallResult<void>>;
  completeTransaction: (
    params: { bid_id: number; property_id: number }
  ) => Promise<ContractCallResult<void>>;
  raiseTransactionDispute: (
    params: { bid_id: number; property_id: number }
  ) => Promise<ContractCallResult<void>>;

  // Payment
  commitPayment: (
    tokenContractId: string,
    propertyId: number,
    amount: string,
    action: Action
  ) => Promise<ContractCallResult<void>>;
  getSupportedStablecoins: () => Promise<ContractCallResult<string[]>>;

  // Admin
  isAdmin: (accountId?: string) => Promise<ContractCallResult<boolean>>;

  // Utilities
  clearError: () => void;
  initialize: (network?: NetworkType) => Promise<void>;
}

export function useNearContract(): UseNearContractReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<string | null>(null);
  const { walletState } = useWallet();

  // Initialize contract service
  const initialize = useCallback(async (network: NetworkType = "testnet") => {
    try {
      setLoading(true);
      setError(null);
      await nearContractService.initialize(network);
    } catch (err: any) {
      setError(err.message || "Failed to initialize contract");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    initialize().catch(console.error);
  }, [initialize]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Helper to execute contract calls with loading state
  const executeContractCall = useCallback(
    async <T,>(
      operation: () => Promise<ContractCallResult<T>>
    ): Promise<ContractCallResult<T>> => {
      try {
        setLoading(true);
        setError(null);
        const result = await operation();

        if (!result.success) {
          setError(result.error || "Operation failed");
        } else if (result.transactionHash) {
          setLastTransaction(result.transactionHash);
        }

        return result;
      } catch (err: any) {
        const errorMessage = err.message || "Operation failed";
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Read-only accountId accessor — used by view calls and by isAdmin's
  // fallback. Doesn't need a signer/privateKey, works for either auth method.
  const getConnectedAccountId = useCallback((): string => {
    if (!walletState.account?.accountId) {
      throw new Error("Wallet not connected. Please connect your wallet first.");
    }
    return walletState.account.accountId;
  }, [walletState]);

  /**
   * Every mutating sheda_contract call signs with the connected account's raw
   * private key via nearContractService.
   *
   * This used to branch on authMethod, dispatching FastAuth accounts to a
   * parallel FastAuthSigner implementation. FastAuth has been removed, so
   * there is one signing path and callers supply one variant.
   */
  const callMutating = useCallback(
    <T,>(
      seedPhraseCall: (accountId: string, privateKey: string) => Promise<ContractCallResult<T>>
    ): Promise<ContractCallResult<T>> => {
      return executeContractCall(async () => {
        const accountId = getConnectedAccountId();
        const privateKey = walletState.account?.privateKey;
        if (!privateKey) {
          throw new Error("Wallet not connected. Please connect your wallet first.");
        }
        return seedPhraseCall(accountId, privateKey);
      });
    },
    [executeContractCall, getConnectedAccountId, walletState]
  );

  // ============================================================================
  // Property Management Methods
  // ============================================================================

  const mintProperty = useCallback(
    (params: MintPropertyParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.mintProperty(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const getProperties = useCallback(
    async (params: GetPropertiesParams) => {
      return executeContractCall(async () => {
        return nearContractService.getProperties(params);
      });
    },
    [executeContractCall]
  );

  const getPropertyById = useCallback(
    async (id: number) => {
      return executeContractCall(async () => {
        return nearContractService.getPropertyById(id);
      });
    },
    [executeContractCall]
  );

  const getMyProperties = useCallback(async () => {
    return executeContractCall(async () => {
      const accountId = getConnectedAccountId();
      return nearContractService.getMyProperties(accountId);
    });
  }, [executeContractCall, getConnectedAccountId]);

  const deleteProperty = useCallback(
    (id: number) =>
      callMutating(
        (accountId, privateKey) => nearContractService.deleteProperty(accountId, privateKey, id)
      ),
    [callMutating]
  );

  const delistProperty = useCallback(
    (id: number) =>
      callMutating(
        (accountId, privateKey) => nearContractService.delistProperty(accountId, privateKey, id)
      ),
    [callMutating]
  );

  const updateListing = useCallback(
    (params: UpdateListingParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.updateListing(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const transferProperty = useCallback(
    (params: TransferPropertyParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.transferProperty(accountId, privateKey, params)
      ),
    [callMutating]
  );

  // ============================================================================
  // Bidding Methods
  // ============================================================================

  const acceptBid = useCallback(
    (params: AcceptBidParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.acceptBid(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const acceptBidWithEscrow = useCallback(
    (params: AcceptBidParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.acceptBidWithEscrow(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const rejectBid = useCallback(
    (params: RejectBidParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.rejectBid(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const cancelBid = useCallback(
    (params: CancelBidParams) =>
      callMutating(
        (accountId, privateKey) => nearContractService.cancelBid(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const getBidsForProperty = useCallback(
    async (propertyId: number) => {
      return executeContractCall(async () => {
        return nearContractService.getBidsForProperty(propertyId);
      });
    },
    [executeContractCall]
  );

  const claimLostBid = useCallback(
    (params: { bid_id: number; property_id: number }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.claimLostBid(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const getMyBids = useCallback(
    async (accountId: string) => {
      return executeContractCall(async () => {
        return nearContractService.getBidsByBidder({
          bidder: accountId,
          from_index: 0,
          limit: 100,
        });
      });
    },
    [executeContractCall]
  );

  // ============================================================================
  // Leasing Methods
  // ============================================================================

  const getLeaseById = useCallback(
    async (leaseId: number) => {
      return executeContractCall(async () => {
        return nearContractService.getLeaseById(leaseId);
      });
    },
    [executeContractCall]
  );

  const raiseDispute = useCallback(
    (params: { bid_id: number; property_id: number; reason: string }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.raiseDispute(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const expireLease = useCallback(
    (leaseId: number) =>
      callMutating(
        (accountId, privateKey) => nearContractService.expireLease(accountId, privateKey, leaseId)
      ),
    [callMutating]
  );

  // ============================================================================
  // Escrow Lifecycle Methods
  // ============================================================================

  const confirmDocumentRelease = useCallback(
    (params: { bid_id: number; property_id: number; document_image_uri: string; document_description: string }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.confirmDocumentRelease(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const confirmDocumentReceipt = useCallback(
    (params: { bid_id: number; property_id: number }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.confirmDocumentReceipt(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const releaseEscrow = useCallback(
    (params: { bid_id: number; property_id: number }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.releaseEscrow(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const completeTransaction = useCallback(
    (params: { bid_id: number; property_id: number }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.completeTransaction(accountId, privateKey, params)
      ),
    [callMutating]
  );

  const raiseTransactionDispute = useCallback(
    (params: { bid_id: number; property_id: number }) =>
      callMutating(
        (accountId, privateKey) => nearContractService.raiseTransactionDispute(accountId, privateKey, params)
      ),
    [callMutating]
  );

  // ============================================================================
  // Payment Methods
  // ============================================================================

  const placeBid = useCallback(
    (
      tokenContractId: string,
      propertyId: number,
      amount: string,
      action: Action
    ) =>
      callMutating(
        (accountId, privateKey) =>
          nearContractService.placeBid(accountId, privateKey, tokenContractId, propertyId, amount, action)
      ),
    [callMutating]
  );

  const commitPayment = useCallback(
    (
      tokenContractId: string,
      propertyId: number,
      amount: string,
      action: Action
    ) =>
      callMutating(
        (accountId, privateKey) =>
          nearContractService.commitPayment(accountId, privateKey, tokenContractId, propertyId, amount, action)
      ),
    [callMutating]
  );

  const getSupportedStablecoins = useCallback(async () => {
    return executeContractCall(async () => {
      return nearContractService.getSupportedStablecoins();
    });
  }, [executeContractCall]);

  // ============================================================================
  // Admin Methods
  // ============================================================================

  const isAdmin = useCallback(
    async (accountId?: string) => {
      return executeContractCall(async () => {
        const targetAccountId = accountId || getConnectedAccountId();
        return nearContractService.isAdmin(targetAccountId);
      });
    },
    [executeContractCall, getConnectedAccountId]
  );

  return {
    // State
    loading,
    error,
    lastTransaction,

    // Property Management
    mintProperty,
    getProperties,
    getPropertyById,
    getMyProperties,
    deleteProperty,
    delistProperty,
    updateListing,
    transferProperty,

    // Bidding
    acceptBid,
    acceptBidWithEscrow,
    rejectBid,
    cancelBid,
    claimLostBid,
    placeBid,
    getBidsForProperty,
    getMyBids,

    // Leasing
    getLeaseById,
    raiseDispute,
    expireLease,

    // Escrow Lifecycle
    confirmDocumentRelease,
    confirmDocumentReceipt,
    releaseEscrow,
    completeTransaction,
    raiseTransactionDispute,

    // Payment
    commitPayment,
    getSupportedStablecoins,

    // Admin
    isAdmin,

    // Utilities
    clearError,
    initialize,
  };
}

export default useNearContract;
