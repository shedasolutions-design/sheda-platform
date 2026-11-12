"use client";

import Link from "next/link";
import { OfferStatus, type OfferMessage, type OfferResponseMessage } from "@/types/offer";

const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(n);
const stamp = (t: string) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** An offer or bid, shown in chat. Accepting and rejecting happen in History, not here. */
export function OfferMessageCard({
  offer,
  isSeller,
  historyHref,
  latest,
}: {
  offer: OfferMessage;
  isSeller: boolean;
  historyHref: string;
  /**
   * The deal's newest step from later messages in this thread ("Deal
   * complete"). The card's own status is frozen at the moment the offer was
   * sent, so it said "Pending Response" on a deal that had long finished.
   */
  latest?: string;
}) {
  const diff = offer.originalPrice - offer.offeredPrice;
  const pct = offer.originalPrice > 0 ? ((diff / offer.originalPrice) * 100).toFixed(1) : "0";
  const status =
    offer.status === OfferStatus.ACCEPTED
      ? ["✓ Offer Accepted", "border-green-200 bg-green-50 text-green-700"]
      : offer.status === OfferStatus.REJECTED
        ? ["✗ Offer Rejected", "border-red-200 bg-red-50 text-red-700"]
        : latest
          ? [`✓ ${latest}`, "border-green-200 bg-green-50 text-green-700"]
          : ["⏳ Pending Response", "border-yellow-200 bg-yellow-50 text-yellow-700"];

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-base font-semibold text-gray-800">{isSeller ? "New Offer Received" : "Offer Sent"}</p>
      <p className="mb-3 text-xs text-gray-500">{stamp(offer.timestamp)}</p>
      <p className="text-sm text-gray-600">Property</p>
      <p className="mb-3 font-semibold text-gray-900">{offer.propertyTitle}</p>
      {isSeller && (
        <>
          <p className="text-sm text-gray-600">From</p>
          <p className="mb-3 font-semibold text-gray-900">{offer.buyerName}</p>
        </>
      )}
      <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm">
        {offer.originalPrice > 0 && (
          <div className="mb-2 flex justify-between">
            <span className="text-gray-600">Original Price</span>
            <span className="text-gray-500 line-through">{naira(offer.originalPrice)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-800">Offered Price</span>
          <span className="text-lg font-bold text-green-600">{naira(offer.offeredPrice)}</span>
        </div>
        {diff > 0 && (
          <p className="mt-2 border-t border-gray-200 pt-2 text-xs text-orange-600">
            {pct}% below asking price (saves {naira(diff)})
          </p>
        )}
      </div>
      <p className={`rounded-lg border px-3 py-2 text-center text-sm font-semibold ${status[1]}`}>{status[0]}</p>
      {offer.status === OfferStatus.PENDING && !latest && (
        <Link href={historyHref} className="mt-3 block rounded-lg border border-primary py-2 text-center font-semibold text-primary hover:bg-active">
          {isSeller ? "Review Offer in History" : "View Bid in History"}
        </Link>
      )}
      {offer.bidId != null && (
        <p className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3 text-xs text-gray-500">
          <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-700">🔗 Blockchain</span>
          Bid ID: {offer.bidId}
        </p>
      )}
    </div>
  );
}

/**
 * The seller's decision on an offer. Wording is written for whoever is
 * reading: the stored message addresses the buyer, and showing it verbatim
 * told sellers their own bid had been accepted.
 */
export function OfferResponseCard({ response, isSeller }: { response: OfferResponseMessage; isSeller: boolean }) {
  const accepted = response.status === "accepted";
  const bookHref =
    response.bidId == null || response.sellerId == null
      ? `/details/${response.propertyId}`
      : `/book-appointment?${new URLSearchParams({
          id: String(response.propertyId),
          bidId: String(response.bidId),
          blockchainPropertyId: String(response.propertyId),
          sellerId: String(response.sellerId),
          propertyTitle: response.propertyTitle,
        }).toString()}`;

  return (
    <div className={`my-2 rounded-lg border p-4 ${accepted ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${accepted ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
          {accepted ? "✓" : "✗"}
        </span>
        <div>
          <p className={`font-bold ${accepted ? "text-green-800" : "text-red-800"}`}>
            {isSeller ? (accepted ? "You Accepted This Offer" : "You Declined This Offer") : accepted ? "Offer Accepted!" : "Offer Not Accepted"}
          </p>
          <p className="text-xs text-gray-600">{stamp(response.timestamp)}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600">Property</p>
      <p className="mb-3 font-semibold text-gray-900">{response.propertyTitle}</p>
      {accepted && response.acceptedPrice ? (
        <div className="mb-3 rounded-lg border border-green-200 bg-white p-3">
          <p className="text-sm text-gray-600">Accepted Price</p>
          <p className="text-xl font-bold text-green-700">{naira(response.acceptedPrice)}</p>
        </div>
      ) : null}
      <p className={`mb-4 text-sm ${accepted ? "text-green-700" : "text-red-700"}`}>
        {isSeller
          ? accepted
            ? "You accepted this bid. The buyer will book a viewing appointment with you next."
            : "You declined this bid. The buyer can make another offer."
          : accepted
            ? "The seller accepted your bid. You can now book a viewing appointment."
            : "The seller declined your bid. You can make another offer."}
      </p>
      {!isSeller && (
        <Link
          href={accepted ? bookHref : `/details/${response.propertyId}`}
          className={`block rounded-lg py-3 text-center font-semibold ${accepted ? "bg-green-600 text-white hover:bg-green-700" : "border border-primary text-primary hover:bg-active"}`}
        >
          {accepted ? "Book Appointment" : "Make Another Offer"}
        </Link>
      )}
    </div>
  );
}
