"use client";

/* eslint-disable @next/next/no-img-element -- previews are local blob: URLs */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Send, X } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import FeedbackModal from "@/components/ui/FeedbackModal";
import Spinner from "@/components/ui/Spinner";
import { inputClass } from "@/components/ui/TextField";
import { useApi } from "@/contexts/ApiContext";
import { useWallet } from "@/contexts/WalletContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import nearContractService from "@/services/nearContract";
import { fileToAsset, type PickedAsset } from "@/lib/files";
import { getQueryParam } from "@/lib/navigation";

const MAX_IMAGES = 5;

interface Params {
  id: string;
  bidId: string;
  blockchainPropertyId: string;
  buyerAccountId: string;
  propertyTitle: string;
}

/**
 * The seller hands the signed agreement to the buyer: the images are stored,
 * then recorded on the deal on-chain, and the buyer is notified.
 */
function ReleaseDocument() {
  const router = useRouter();
  const { getPropertyById, uploadTransactionDocuments, sendTransactionNotification, getUserByWallet } = useApi();
  const { walletState, getAuthorizedPrivateKey, currentNetwork } = useWallet();
  const { run } = useTransactionToast();
  const [params, setParams] = useState<Params | null>(null);
  const [property, setProperty] = useState<{ title?: string; location?: string; images?: { image_url: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<(PickedAsset & { file: File })[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p: Params = {
      id: getQueryParam("id") ?? "",
      bidId: getQueryParam("bidId") ?? "",
      blockchainPropertyId: getQueryParam("blockchainPropertyId") ?? "",
      buyerAccountId: getQueryParam("buyerAccountId") ?? "",
      propertyTitle: getQueryParam("propertyTitle") ?? "",
    };
    setParams(p);
    if (!p.id) {
      setLoading(false);
      return;
    }
    getPropertyById(Number(p.id), { silent: true })
      .then((prop) => setProperty(prop as typeof property))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Free the previews when leaving.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((i) => URL.revokeObjectURL(i.uri)), []);

  const title = params?.propertyTitle || property?.title || "Property";
  const missing = !params?.bidId || !params?.blockchainPropertyId || !params?.buyerAccountId;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room)
      .map((file) => ({ ...fileToAsset(file), file }));
    setImages((prev) => [...prev, ...picked]);
  };

  const release = async () => {
    if (!params || !walletState.account?.accountId) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const privateKey = await getAuthorizedPrivateKey(walletState.account.accountId);
      if (!privateKey) throw new Error("Your wallet keys couldn't be unlocked.");
      await nearContractService.initialize(currentNetwork);

      // Stored first so the chain gets a lasting link. If the upload fails we
      // stop: the old screen wrote a placeholder or a this-device-only file
      // address on-chain permanently.
      let mediaUri = "";
      if (images.length > 0) {
        const up = await uploadTransactionDocuments(
          Number(params.bidId),
          images.map(({ uri, fileName, mimeType }) => ({ uri, fileName, mimeType })),
          description.trim() || undefined
        );
        mediaUri = up?.uploaded_urls?.[0] ?? "";
        if (!mediaUri) throw new Error("The documents couldn't be uploaded. Please try again.");
      }

      const bidId = Number(params.bidId);
      const propertyId = Number(params.blockchainPropertyId);
      const result = await run({
        loadingMessage: "Releasing documents...",
        successMessage: "Agreement documents released to the buyer.",
        notification: { type: "docs_released", title: "Documents Released", message: `Agreement documents for "${title}" were released to the buyer.` },
        action: async () => {
          const r = await nearContractService.confirmDocumentRelease(walletState.account!.accountId, privateKey, {
            bid_id: bidId,
            property_id: propertyId,
            document_image_uri: mediaUri,
            document_description: description.trim() || `Agreement for ${title}`,
          });
          if (!r.success) throw new Error(r.error || "Failed to release documents on-chain. Please try again.");
          return r;
        },
      });

      // Tell the buyer (resolved from their wallet; the property's agent is the seller).
      try {
        const buyer = await getUserByWallet(params.buyerAccountId);
        if (buyer?.id)
          await sendTransactionNotification({
            transaction_id: `bid_${bidId}`,
            event: "docs_released",
            recipient_user_id: buyer.id,
            property_id: propertyId,
            metadata: { propertyTitle: title, transactionHash: result.transactionHash, mediaUri },
          });
      } catch {
        /* the release itself succeeded */
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={36} />
      </div>
    );

  return (
    <>
      <PageHeader title="Release documents" fallback="/activity" />
      <div className="mx-auto max-w-2xl px-5 pb-10 pt-5">
        {property?.images?.[0]?.image_url && (
          <img src={property.images[0].image_url} alt="" className="mb-3 aspect-video w-full rounded-xl object-cover" />
        )}
        <h1 className="text-lg font-medium">{title}</h1>
        {property?.location && (
          <p className="mb-4 flex items-center gap-1 text-sm text-secondaryText">
            <MapPin size={14} /> {property.location}
          </p>
        )}
        {missing ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            This page needs a deal to release documents for. Open it from the deal on your Activities page.
          </p>
        ) : (
          <>
            <p className="mb-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              <span className="flex items-center gap-1.5 font-medium">
                <Send size={14} /> Sending to buyer
              </span>
              <span className="break-all text-xs">{params!.buyerAccountId}</span>
            </p>

            <label className="mb-5 block">
              <span className="mb-1 block text-sm font-medium">Agreement description</span>
              <textarea
                rows={5}
                className={`${inputClass} resize-y`}
                placeholder="Describe the agreement terms, conditions, and any important details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
              />
            </label>

            <p className="mb-1 text-sm font-medium">Agreement documents</p>
            <p className="mb-3 text-xs text-secondaryText">Images of signed agreements or property documents, up to {MAX_IMAGES}.</p>
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <ul className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {images.map((img, i) => (
                <li key={img.uri} className="relative aspect-square">
                  <img src={img.uri} alt={`Document ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove document ${i + 1}`}
                    onClick={() => {
                      URL.revokeObjectURL(img.uri);
                      setImages((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
              {images.length < MAX_IMAGES && (
                <li className="aspect-square">
                  <button
                    type="button"
                    onClick={() => {
                      if (inputRef.current) inputRef.current.value = "";
                      inputRef.current?.click();
                    }}
                    className="flex h-full w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-borderColor text-xs text-primary hover:border-primary"
                  >
                    <Plus size={20} /> {images.length}/{MAX_IMAGES}
                  </button>
                </li>
              )}
            </ul>

            <p className="mb-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Releasing records these documents on the blockchain against this deal and sends them to the buyer. It&apos;s permanent and can&apos;t be
              reversed.
            </p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <Button
              full
              loading={busy}
              disabled={!description.trim() && images.length === 0}
              onClick={() => setConfirming(true)}
            >
              {busy ? "Releasing…" : "Release documents"}
            </Button>
          </>
        )}
      </div>
      <FeedbackModal
        isVisible={confirming}
        type="warning"
        title="Release these documents?"
        message={`They'll be recorded on the blockchain and sent to ${params?.buyerAccountId}. This can't be undone.`}
        actionLabel="Release"
        onAction={release}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

export default function ReleaseDocumentPage() {
  return (
    <AuthGuard requireAuth>
      <ReleaseDocument />
    </AuthGuard>
  );
}
