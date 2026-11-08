/**
 * The backend must never diverge from the chain on a listing's availability.
 *
 * Three separate places used to let it: delete and delist both logged a failed
 * chain call and updated the backend anyway, and relist never touched the
 * chain at all. Each produces a state where the app and the contract disagree
 * about whether a property can be bid on — and every bid locks a buyer's
 * stablecoins in escrow, so the disagreement costs real money.
 *
 * These cover the ordering rule itself rather than the component: the chain
 * call has to succeed before the backend call is made, and a relist has to
 * make a chain call at all.
 */

type ChainResult = { success: boolean; error?: string };

/**
 * The sequence MyListings.confirmDelete / confirmDelist run: move the chain,
 * and only touch the backend once it agrees.
 */
async function syncListingChange(opts: {
  chainCall?: () => Promise<ChainResult>;
  backendCall: () => Promise<void>;
  failureMessage: string;
}): Promise<void> {
  if (opts.chainCall) {
    const result = await opts.chainCall();
    if (!result.success) {
      throw new Error(result.error || opts.failureMessage);
    }
  }
  await opts.backendCall();
}

describe("listing changes stay in step with the chain", () => {
  it("does not touch the backend when the chain call fails", async () => {
    const backendCall = jest.fn().mockResolvedValue(undefined);

    await expect(
      syncListingChange({
        chainCall: async () => ({
          success: false,
          // What the contract's escrow guard actually returns.
          error:
            "Cannot delete this property: 1 bid(s) still hold funds in escrow " +
            "against it — bid #15 by alice.testnet (Pending, 1000000 tokens).",
        }),
        backendCall,
        failureMessage: "fallback",
      })
    ).rejects.toThrow(/still hold funds in escrow/);

    // The whole point: the listing must still exist on both sides.
    expect(backendCall).not.toHaveBeenCalled();
  });

  it("surfaces the contract's own reason, not a generic message", async () => {
    // The seller can only act on this if they're told which bids are blocking,
    // so the contract's message has to reach them intact.
    await expect(
      syncListingChange({
        chainCall: async () => ({
          success: false,
          error: "bid #17 by bob.testnet (DocsConfirmed, 2500000 tokens)",
        }),
        backendCall: jest.fn(),
        failureMessage: "Please try again.",
      })
    ).rejects.toThrow("bid #17 by bob.testnet (DocsConfirmed, 2500000 tokens)");
  });

  it("falls back to its own message when the chain gives none", async () => {
    await expect(
      syncListingChange({
        chainCall: async () => ({ success: false }),
        backendCall: jest.fn(),
        failureMessage: "Couldn't delist this property on-chain.",
      })
    ).rejects.toThrow("Couldn't delist this property on-chain.");
  });

  it("updates the backend once the chain has agreed", async () => {
    const order: string[] = [];

    await syncListingChange({
      chainCall: async () => {
        order.push("chain");
        return { success: true };
      },
      backendCall: async () => {
        order.push("backend");
      },
      failureMessage: "unused",
    });

    // Order matters, not just that both ran: the chain is the source of truth
    // for escrow, so the backend follows it.
    expect(order).toEqual(["chain", "backend"]);
  });

  it("still updates the backend for a listing that was never minted", async () => {
    // No blockchain_property_id means nothing on-chain to keep in step with,
    // and those listings must stay deletable.
    const backendCall = jest.fn().mockResolvedValue(undefined);

    await syncListingChange({ chainCall: undefined, backendCall, failureMessage: "unused" });

    expect(backendCall).toHaveBeenCalledTimes(1);
  });

  it("relisting makes a chain call rather than only flipping is_active", async () => {
    // Relist used to skip the chain entirely, so a property came back in the
    // app while the contract still had is_for_sale = false: it looked
    // available and no bid could be placed on it.
    const updateListing = jest.fn().mockResolvedValue({ success: true });
    const backendCall = jest.fn().mockResolvedValue(undefined);

    await syncListingChange({
      chainCall: () =>
        updateListing({
          property_id: 7,
          price: "250000000",
          is_for_sale: true,
          lease_duration_months: null,
        }),
      backendCall,
      failureMessage: "unused",
    });

    expect(updateListing).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 7, is_for_sale: true })
    );
    expect(backendCall).toHaveBeenCalled();
  });
});
