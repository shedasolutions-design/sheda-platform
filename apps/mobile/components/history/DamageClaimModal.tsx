/**
 * DamageClaimModal
 *
 * An owner claiming against a tenant's security deposit after the lease ends.
 *
 * The amount entered is what the owner is *asking* for, not what they receive:
 * an admin settles the claim, and whatever is not awarded goes back to the
 * tenant. The copy says so, because a landlord who believes this is a
 * self-service withdrawal will describe the damage accordingly.
 */
import React, { useState } from "react";
import { Modal, View, TouchableOpacity, ActivityIndicator } from "react-native";
import InterRegular from "@/components/Text/InterRegular";
import InterMedium from "@/components/Text/InterMedium";
import InterSemiBold from "@/components/Text/InterSemiBold";
import StyledTextInput from "@/components/input/textInput";
import Button from "@/components/common/Button";

interface DamageClaimModalProps {
  visible: boolean;
  onClose: () => void;
  /** Deposit held, in atomic stablecoin units. */
  depositHeld: string;
  /** Nanosecond timestamp after which the owner can no longer claim. */
  deadline: number;
  submitting?: boolean;
  onSubmit: (amountAtomic: string, reason: string) => void;
}

const DamageClaimModal: React.FC<DamageClaimModalProps> = ({
  visible,
  onClose,
  depositHeld,
  deadline,
  submitting = false,
  onSubmit,
}) => {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const heldUsd = Number(depositHeld) / 1_000_000;
  const asked = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
  const overDeposit = asked > heldUsd;
  const valid = asked > 0 && !overDeposit && reason.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    // Atomic units, matching how every other amount reaches the contract.
    onSubmit(Math.round(asked * 1_000_000).toString(), reason.trim());
  };

  const close = () => {
    setAmount("");
    setReason("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          paddingHorizontal: 20,
        }}
      >
        <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 18 }}>
          <InterSemiBold style={{ fontSize: 17, marginBottom: 4 }}>
            Claim against the deposit
          </InterSemiBold>
          <InterRegular style={{ fontSize: 13, color: "#6B7280", lineHeight: 19, marginBottom: 14 }}>
            You are asking for this, not taking it. An admin reviews the claim and
            decides what you are awarded; anything they do not award goes back to
            the tenant. Describe the damage as you would to someone who has to
            judge it.
          </InterRegular>

          <View
            style={{
              backgroundColor: "#F9FAFB",
              borderRadius: 8,
              padding: 10,
              marginBottom: 14,
            }}
          >
            <InterMedium style={{ fontSize: 13, color: "#111827" }}>
              ${heldUsd.toFixed(2)} held
            </InterMedium>
            <InterRegular style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
              You can claim until {new Date(Math.floor(deadline / 1_000_000)).toLocaleDateString()}.
              After that the tenant can take the whole deposit back.
            </InterRegular>
          </View>

          <InterRegular style={{ fontSize: 13, marginBottom: 6 }}>Amount to claim (USD)</InterRegular>
          <StyledTextInput
            placeholder={`Up to ${heldUsd.toFixed(2)}`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          {overDeposit && (
            <InterRegular style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>
              That is more than the deposit held. The most you can claim is ${heldUsd.toFixed(2)}.
            </InterRegular>
          )}

          <InterRegular style={{ fontSize: 13, marginTop: 14, marginBottom: 6 }}>
            What is the damage?
          </InterRegular>
          <StyledTextInput
            placeholder="Describe what was damaged and how"
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            style={{ height: 90, textAlignVertical: "top" }}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                onPress={close}
                disabled={submitting}
                style={{
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  alignItems: "center",
                }}
              >
                <InterRegular style={{ color: "#6B7280" }}>Cancel</InterRegular>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Button onPress={submit} disabled={!valid || submitting} className="rounded-lg">
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <InterMedium style={{ color: "#fff" }}>Submit claim</InterMedium>
                )}
              </Button>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DamageClaimModal;
