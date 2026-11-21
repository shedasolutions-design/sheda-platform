"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CodeInput from "@/components/ui/CodeInput";
import Spinner from "@/components/ui/Spinner";
import apiService from "@/services/api";

/**
 * "We've emailed you a code": the proof-it's-you step before a sensitive
 * change (viewing wallet keys, setting a PIN, deleting the account).
 *
 * Sends the code when it opens, and hands the entered code to onCode, which
 * does the actual work (or checks it with /auth/verify-code) and throws with
 * a readable message if it's wrong. The session is never replaced.
 */
export default function EmailCodeModal({
  open,
  title,
  reason,
  email,
  confirmLabel = "Confirm",
  onCode,
  onClose,
}: {
  open: boolean;
  title: string;
  /** One line: what the code is for. */
  reason: string;
  email?: string | null;
  confirmLabel?: string;
  onCode: (code: string) => Promise<void>;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentForOpen = useRef(false);

  const send = async () => {
    setError(null);
    const res = await apiService.sendActionCode();
    if (res.ok) {
      setSent(true);
      setCooldown(30);
    } else {
      setError("We couldn't send the code. Please try again.");
    }
  };

  useEffect(() => {
    if (!open) {
      sentForOpen.current = false;
      return;
    }
    if (sentForOpen.current) return;
    sentForOpen.current = true;
    setCode("");
    setError(null);
    setSent(false);
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (entered: string = code) => {
    if (entered.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCode(entered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work. Please try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title} size="sm">
      <p className="mb-4 text-sm text-secondaryText">
        {reason}{" "}
        {sent ? (
          <>
            We&apos;ve sent a 4-digit code to <span className="font-medium text-primaryText">{email || "your email"}</span>.
          </>
        ) : (
          "Sending a code to your email…"
        )}
      </p>
      <CodeInput length={4} autoFocus label="Email code" value={code} onChange={setCode} onComplete={submit} disabled={busy} />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {busy && (
        <div className="mt-3 flex justify-center">
          <Spinner size={20} />
        </div>
      )}
      <Button full className="mt-5" onClick={() => submit()} disabled={busy || code.length !== 4}>
        {confirmLabel}
      </Button>
      <div className="mt-3 flex justify-center text-sm">
        {cooldown > 0 ? (
          <span className="text-secondaryText">Send again in {cooldown}s</span>
        ) : (
          <button type="button" onClick={() => void send()} className="text-primary hover:underline" disabled={busy}>
            Send the code again
          </button>
        )}
      </div>
      <Button variant="outline" full className="mt-3" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
    </Modal>
  );
}
