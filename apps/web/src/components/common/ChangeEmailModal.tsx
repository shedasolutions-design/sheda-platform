"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import CodeInput from "@/components/ui/CodeInput";
import apiService from "@/services/api";

const errorOf = (res: unknown, fallback: string) => {
  const detail = (res as { error?: { detail?: unknown } } | null)?.error?.detail;
  return typeof detail === "string" ? detail : fallback;
};

/**
 * Changing the account's email: the new address gets a code, and nothing
 * changes until it's entered. The old address is told afterwards.
 */
export default function ChangeEmailModal({
  open,
  currentEmail,
  onClose,
  onChanged,
}: {
  open: boolean;
  currentEmail?: string | null;
  onClose: () => void;
  onChanged: (email: string) => void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [newEmail, setNewEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep("email");
    setNewEmail("");
    setCode("");
    setError(null);
    onClose();
  };

  const start = async () => {
    const value = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    const res = await apiService.changeEmailStart(value);
    setBusy(false);
    if (!res.ok || !res.data) return setError(errorOf(res, "We couldn't send the code. Please try again."));
    setSentTo(res.data.sent_to);
    setStep("code");
  };

  const confirm = async (entered: string = code) => {
    if (entered.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    const res = await apiService.changeEmailConfirm(entered);
    setBusy(false);
    if (!res.ok || !res.data) {
      setCode("");
      return setError(errorOf(res, "That code didn't work. Please try again."));
    }
    onChanged(res.data.email);
    close();
  };

  return (
    <Modal open={open} onClose={busy ? undefined : close} title="Change email" size="sm">
      {step === "email" ? (
        <>
          <p className="mb-4 text-sm text-secondaryText">
            Sign-in codes, password resets and deal updates go to your email. We&apos;ll send a code to the new
            address to make sure it&apos;s yours. Your current email{currentEmail ? ` (${currentEmail})` : ""} stays
            until then.
          </p>
          <TextField
            label="New email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <Button full className="mt-5" loading={busy} onClick={start}>
            Send code
          </Button>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-secondaryText">
            We&apos;ve sent a 4-digit code to <span className="font-medium text-primaryText">{sentTo}</span>. Enter it
            to switch to that address.
          </p>
          <CodeInput length={4} autoFocus label="Email code" value={code} onChange={setCode} onComplete={confirm} disabled={busy} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <Button full className="mt-5" loading={busy} disabled={code.length !== 4} onClick={() => confirm()}>
            Change email
          </Button>
          <button type="button" onClick={() => setStep("email")} className="mx-auto mt-3 block text-sm text-primary hover:underline">
            Use a different address
          </button>
        </>
      )}
      <Button variant="outline" full className="mt-3" onClick={close} disabled={busy}>
        Cancel
      </Button>
    </Modal>
  );
}
