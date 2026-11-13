"use client";

import { useEffect, useState } from "react";
import { COLLECTIONS_MARKETPLACE_ID } from "@/config/collections";
import nearContractService from "@/services/nearContract";

/**
 * Sheda's fee on completed sales and rent, in basis points, as the
 * marketplace contract has it. Zero while no fee wallet is set, and on a
 * contract from before the fee existed, so screens only mention a fee that
 * will actually be taken.
 */
export function usePlatformFee(): number {
  const [bps, setBps] = useState(0);
  useEffect(() => {
    let alive = true;
    nearContractService
      .viewOn<[number, string | null]>(COLLECTIONS_MARKETPLACE_ID, "get_platform_fee", {})
      .then(([fee, wallet]) => alive && setBps(wallet ? Number(fee) : 0))
      .catch(() => alive && setBps(0));
    return () => {
      alive = false;
    };
  }, []);
  return bps;
}

/** The sentence a seller or landlord reads before accepting. */
export function feeSentence(bps: number): string {
  return bps > 0 ? ` Sheda's ${bps / 100}% fee comes off the payment when it completes.` : "";
}
