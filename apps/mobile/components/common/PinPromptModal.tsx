import { useState, useEffect, useRef } from "react";
import { Modal, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { OtpInput } from "react-native-otp-entry";
import InterSemiBold from "@/components/Text/InterSemiBold";
import InterRegular from "@/components/Text/InterRegular";
import Button from "@/components/common/Button";
import { useApi } from "@/contexts/ApiContext";
import secureStorageService from "@/services/secureStorage";

// Internal steps the modal can be in, regardless of which entry mode it started from.
type Step = "verify-old" | "verify" | "reset-otp" | "setup";

export interface PinPromptModalProps {
  visible: boolean;
  accountId: string;
  /**
   * "verify" — confirm an existing PIN before a transaction (Cancel resolves false).
   * "setup" — no PIN exists yet; go straight to creating one.
   * "change" — an existing PIN must be re-entered before a new one can be set.
   */
  mode: "verify" | "setup" | "change";
  onDone: (success: boolean) => void;
}

const OTP_THEME = {
  containerStyle: { width: "100%" as const, marginVertical: 12 },
  pinCodeContainerStyle: {
    width: 52,
    height: 52,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  filledPinCodeContainerStyle: { backgroundColor: "#D8DADC" },
};

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
    title: "Verify Your Email",
    description: "We've sent a code to your email. Enter it below to reset your PIN.",
  },
  setup: {
    title: "Set Your Transaction PIN",
    description: "Choose a 4-digit PIN. You'll be asked for it before every transaction.",
  },
};

export default function PinPromptModal({ visible, accountId, mode, onDone }: PinPromptModalProps) {
  const { user, sendOtp, verifyOtp } = useApi();
  const [step, setStep] = useState<Step>(mode === "change" ? "verify-old" : mode === "setup" ? "setup" : "verify");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otpSentForStep = useRef(false);

  // Reset internal state whenever the modal is (re)opened
  useEffect(() => {
    if (visible) {
      setStep(mode === "change" ? "verify-old" : mode === "setup" ? "setup" : "verify");
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
      sendOtp(user.email).catch(() => setError("Could not send the code. Try again."));
    }
  }, [step, user?.email, sendOtp]);

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
      await verifyOtp(user.email, enteredOtp);
      setStep("setup");
      setOtp("");
    } catch {
      setError("Incorrect or expired code.");
      setOtp("");
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = async () => {
    if (pin.length !== 4) return;
    if (pin !== confirmPin) {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onDone(false)}>
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white rounded-2xl p-5 w-full max-w-sm">
          <InterSemiBold className="text-lg mb-1">{copy.title}</InterSemiBold>
          <InterRegular className="text-secondaryText text-sm mb-2">{copy.description}</InterRegular>

          {error && (
            <InterRegular className="text-red-500 text-xs mb-2">{error}</InterRegular>
          )}

          {(step === "verify" || step === "verify-old") && (
            <OtpInput
              key={step}
              numberOfDigits={4}
              type="numeric"
              focusColor="#C1272D"
              theme={OTP_THEME}
              onFilled={(text) => {
                setPin(text);
                handleVerify(text);
              }}
              textInputProps={{ accessibilityLabel: "Transaction PIN" }}
            />
          )}

          {step === "reset-otp" && (
            <OtpInput
              key="otp"
              numberOfDigits={4}
              type="numeric"
              focusColor="#C1272D"
              theme={OTP_THEME}
              onFilled={(text) => {
                setOtp(text);
                handleVerifyOtp(text);
              }}
              textInputProps={{ accessibilityLabel: "Email verification code" }}
            />
          )}

          {step === "setup" && (
            <>
              <InterRegular className="text-xs text-secondaryText mb-1">
                {confirmPin.length === 0 && pin.length === 4 ? "Confirm your PIN" : "Enter a 4-digit PIN"}
              </InterRegular>
              {pin.length < 4 ? (
                <OtpInput
                  key="new-pin"
                  numberOfDigits={4}
                  type="numeric"
                  focusColor="#C1272D"
                  theme={OTP_THEME}
                  onFilled={(text) => setPin(text)}
                  textInputProps={{ accessibilityLabel: "New transaction PIN" }}
                />
              ) : (
                <OtpInput
                  key="confirm-pin"
                  numberOfDigits={4}
                  type="numeric"
                  focusColor="#C1272D"
                  theme={OTP_THEME}
                  onFilled={(text) => {
                    setConfirmPin(text);
                    handleSetup();
                  }}
                  textInputProps={{ accessibilityLabel: "Confirm transaction PIN" }}
                />
              )}
            </>
          )}

          {busy && (
            <View className="items-center py-2">
              <ActivityIndicator size="small" color="#C1272D" />
            </View>
          )}

          {step === "verify" && (
            <TouchableOpacity onPress={() => setStep("reset-otp")} className="mt-3">
              <InterRegular className="text-primary text-sm text-center">Forgot PIN?</InterRegular>
            </TouchableOpacity>
          )}

          <Button color="transparent" className="mt-4 border border-borderColor rounded-lg" onPress={() => onDone(false)}>
            <InterSemiBold className="text-secondaryText text-center">Cancel</InterSemiBold>
          </Button>
        </View>
      </View>
    </Modal>
  );
}
