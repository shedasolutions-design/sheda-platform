// ============================================================================
// Contract Error Parser — User-Friendly Error Messages
// ============================================================================
// Maps on-chain panic messages to actionable user-facing strings.
// Source: INTEGRATION_GUIDE.md Part 13
// ============================================================================

export function parseContractError(error: unknown): string {
    if (!(error instanceof Error)) return 'Unknown error occurred';
    const msg = error.message;

    if (msg.includes('InvalidPaymentToken'))
        return 'This token is not accepted. Please use USDC or USDT.';
    if (msg.includes('IncorrectBidAmount'))
        return 'Payment amount mismatch. Please try again.';
    if (msg.includes('InvalidBidAmount'))
        return 'Your offer must be at least the asking price.';
    if (msg.includes('PropertyNotForSale'))
        return 'This property is not currently accepting offers.';
    if (msg.includes('PropertyNotFound'))
        return 'Property not found. It may have been removed.';
    if (msg.includes('NotPropertyOwner'))
        return 'Only the property owner can perform this action.';
    if (msg.includes('BidNotFound'))
        return 'Bid not found. Please refresh and try again.';
    if (msg.includes('InvalidBidStatus'))
        return 'This action is not available for the current bid status.';
    if (msg.includes('Reentrancy') || msg.includes('in progress'))
        return 'Another transaction is in progress. Please wait.';
    if (msg.includes('EscrowNotReady'))
        return 'The escrow hold period has not yet passed. Please wait for the countdown to complete.';
    if (msg.includes('does not have enough balance'))
        return 'Insufficient NEAR balance. Please add funds to your wallet.';
    if (msg.includes('panicked'))
        return 'Transaction was rejected by the contract.';

    // Generic fallback
    return msg;
}

/**
 * Check if an error is an insufficient balance error
 */
export function isInsufficientBalanceError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return (
        msg.includes('does not have enough balance') ||
        msg.includes('insufficient') ||
        msg.includes('not enough') ||
        msg.includes('lackoffunds') ||
        msg.includes('notenoughbalance')
    );
}

/**
 * Check if an error means the escrow time hold hasn't passed yet (PATH 3)
 */
export function isEscrowNotReadyError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.message.includes('EscrowNotReady');
}
