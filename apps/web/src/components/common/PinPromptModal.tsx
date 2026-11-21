"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CodeInput from "@/components/ui/CodeInput";
import Spinner from "@/components/ui/Spinner";
import { useApi } from "@/contexts/ApiContext";
import apiService from "@/services/api";
import secureStorageService from "@/services/secureStorage";

// Internal steps the modal can be in, regardless of which entry mode it started from.
type Step = "verify-old" | "verify" | "reset-otp" | "setup";

export interface PinPromptModalProps {
  visible: boolean;
  accountId: string;
  /**
   * "verify": confirm an existing PIN before a transaction (Cancel resolves false).
   * "setup": no PIN exists yet; go straight to creating one.
   * "change": an existing PIN must be re-entered before a new one can be set.
   */
  mode: "verify" | "setup" | "change";
  onDone: (success: boolean) => void;
}

const STEP_COPY: Record<Step, { title: string; description: string }> = {
  verify: {
    title: "Confirm Transaction",
    description: "Enter your transaction PIN to continue.",
  },
  "verify-old": {
    title: "Enter Current PIN",
    description: "Confirm your current PIN before setting a new one.",
  },
  "reset-otp": {
    title: "Confirm it's you",
    description: "We've sent a code to your email. Enter it to set your PIN.",
  },
  setup: {
    title: "Set Your Transaction PIN",
    description: "Choose a 4-digit PIN. You'll be asked for it before every transaction.",
  },
};

// A new PIN can reveal the wallet's keys, so setting the first one needs the
// emailed code: an unlocked browser alone must not be enough.
const initialStep = (mode: PinPromptModalProps["mode"]): Step =>
  mode === "change" ? "verify-old" : mode === "setup" ? "reset-otp" : "verify";

export default function PinPromptModal({ visible, accountId, mode, onDone }: PinPromptModalProps) {
  const { user } = useApi();
  const [step, setStep] = useState<Step>(initialStep(mode));
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otpSentForStep = useRef(false);

  // Reset internal state whenever the modal is (re)opened.
  useEffect(() => {
    if (visible) {
      setStep(initialStep(mode));
      setPin("");
      setConfirmPin("");
      setOtp("");
      setError(null);
      otpSentForStep.current = false;
    }
  }, [visible, mode]);

  useEffect(() => {
    if (step === "reset-otp" && !otpSentForStep.current && user?.email) {
      otpSentForStep.current = true;
      apiService
        .sendActionCode()
        .then((r) => {
          if (!r.ok) setError("Could not send the code. Try again.");
        })
        .catch(() => setError("Could not send the code. Try again."));
    }
  }, [step, user?.email]);

  const handleVerify = async (enteredPin: string) => {
    setBusy(true);
    setError(null);
    try {
      const ok = await secureStorageService.verifyPin(accountId, enteredPin);
      if (!ok) {
        setError("Incorrect PIN. Try again.");
        setPin("");
        return;
      }
      if (step === "verify-old") {
        setStep("setup");
        setPin("");
      } else {
        onDone(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (enteredOtp: string) => {
    if (!user?.email) {
      setError("No email on file for this account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Checked without touching the session. verify-otp used to replace it
      // with a five-minute code-only token, so everything failed soon after.
      const r = await apiService.verifyCode(enteredOtp);
      if (!r.ok) throw new Error("bad code");
      setStep("setup");
      setOtp("");
    } catch {
      setError("Incorrect or expired code.");
      setOtp("");
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = async (confirmed: string) => {
    if (pin.length !== 4) return;
    if (pin !== confirmed) {
      setError("PINs don't match.");
      setConfirmPin("");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await secureStorageService.savePin(accountId, pin);
      onDone(true);
    } catch {
      setError("Could not save your PIN. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = STEP_COPY[step];

  return (
    <Modal open={visible} onClose={() => onDone(false)} size="sm" title={copy.title}>
      <p className="mb-4 text-sm text-secondaryText">{copy.description}</p>
      {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

      {(step === "verify" || step === "verify-old") && (
        <CodeInput
          key={step}
          length={4}
          secure
          autoFocus
          label="Transaction PIN"
          value={pin}
          onChange={setPin}
          onComplete={handleVerify}
          disabled={busy}
        />
      )}

      {step === "reset-otp" && (
        <CodeInput
          key="otp"
          length={4}
          autoFocus
          label="Email verification code"
          value={otp}
          onChange={setOtp}
          onComplete={handleVerifyOtp}
          disabled={busy}
        />
      )}

      {step === "setup" && (
        <>
          <p className="mb-2 text-center text-xs text-secondaryText">
            {pin.length === 4 ? "Confirm your PIN" : "Enter a 4-digit PIN"}
          </p>
          {pin.length < 4 ? (
            <CodeInput
              key="new-pin"
              length={4}
              secure
              autoFocus
              label="New transaction PIN"
              value={pin}
              onChange={setPin}
            />
          ) : (
            <CodeInput
              key="confirm-pin"
              length={4}
              secure
              autoFocus
              label="Confirm transaction PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              onComplete={handleSetup}
              disabled={busy}
            />
          )}
        </>
      )}

      {busy && (
        <div className="flex justify-center py-3">
          <Spinner size={20} />
        </div>
      )}

      {step === "verify" && (
        <button
          type="button"
          onClick={() => setStep("reset-otp")}
          className="mx-auto mt-4 block text-sm text-primary hover:underline"
        >
          Forgot PIN?
        </button>
      )}

      <Button variant="outline" full className="mt-5" onClick={() => onDone(false)}>
        Cancel
      </Button>
    </Modal>
  );
}
