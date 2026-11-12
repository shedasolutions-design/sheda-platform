/**
 * Deal updates that travel through chat.
 *
 * The deal cards (OngoingCard, release-document) send each step of a deal to
 * the other person as a JSON chat message ({"type":"payment_released",...}).
 * Only offers had a renderer, so every other step showed up in the inbox
 * preview and the thread as raw JSON. This reads them back into words.
 */

export interface DealUpdate {
  type: string;
  propertyTitle?: string;
  propertyId?: number;
  bidId?: number;
}

const WORDS: Record<string, string> = {
  bid_accepted: "Offer accepted",
  bid_rejected: "Offer declined",
  bid_cancelled: "Offer withdrawn",
  appointment_booked: "Viewing requested",
  appointment_accepted: "Viewing confirmed",
  appointment_rejected: "Viewing declined",
  docs_released: "Agreement sent",
  docs_confirmed: "Agreement accepted",
  payment_released: "Payment released",
  transaction_completed: "Deal complete",
  dispute_raised: "Dispute raised",
  lease_completed: "Lease ended",
  lease_renewed: "Lease renewed",
};

/** The update in a chat message, or null for an ordinary message. */
export function parseDealUpdate(message: string): DealUpdate | null {
  const text = message?.trim();
  if (!text || text[0] !== "{") return null;
  try {
    const data = JSON.parse(text);
    if (!data || typeof data.type !== "string" || !(data.type in WORDS)) return null;
    return {
      type: data.type,
      propertyTitle: typeof data.propertyTitle === "string" ? data.propertyTitle : undefined,
      propertyId: typeof data.propertyId === "number" ? data.propertyId : undefined,
      bidId: typeof data.bidId === "number" ? data.bidId : undefined,
    };
  } catch {
    return null;
  }
}

/** "Payment released: "QA Flat"", for previews and the thread. */
export function dealUpdateText(update: DealUpdate): string {
  const what = WORDS[update.type] ?? "Deal update";
  return update.propertyTitle ? `${what}: "${update.propertyTitle}"` : what;
}
