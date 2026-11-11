"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TextField, { inputClass } from "@/components/ui/TextField";

/**
 * An owner claiming against a tenant's security deposit after the lease ends.
 * The amount is what the owner asks for: an admin decides the award, and the
 * rest goes back to the tenant. The copy says so.
 */
export default function DamageClaimModal({
  visible,
  onClose,
  depositHeld,
  deadline,
  submitting = false,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  /** Deposit held, in atomic stablecoin units. */
  depositHeld: string;
  /** Nanosecond timestamp after which the owner can no longer claim. */
  deadline: number;
  submitting?: boolean;
  onSubmit: (amountAtomic: string, reason: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const heldUsd = Number(depositHeld) / 1_000_000;
  const asked = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
  const over = asked > heldUsd;
  const valid = asked > 0 && !over && reason.trim().length > 0;

  const close = () => {
    setAmount("");
    setReason("");
    onClose();
  };

  return (
    <Modal open={visible} onClose={submitting ? undefined : close} title="Claim against the deposit">
      <p className="mb-4 text-[13px] leading-5 text-gray-500">
        You are asking for this, not taking it. An admin reviews the claim and decides what you are awarded; anything they do not
        award goes back to the tenant. Describe the damage as you would to someone who has to judge it.
      </p>
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-[13px] font-medium text-gray-900">${heldUsd.toFixed(2)} held</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          You can claim until {new Date(Math.floor(deadline / 1_000_000)).toLocaleDateString()}. After that the tenant can take the
          whole deposit back.
        </p>
      </div>
      <TextField
        label="Amount to claim (USD)"
        inputMode="decimal"
        placeholder={`Up to ${heldUsd.toFixed(2)}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={over ? `That is more than the deposit held. The most you can claim is $${heldUsd.toFixed(2)}.` : undefined}
      />
      <label htmlFor="damage" className="mb-1 mt-4 block text-sm">
        What is the damage?
      </label>
      <textarea id="damage" rows={4} placeholder="Describe what was damaged and how" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      <div className="mt-5 flex gap-3">
        <Button variant="outline" className="flex-1" onClick={close} disabled={submitting}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!valid}
          loading={submitting}
          onClick={() => valid && onSubmit(Math.round(asked * 1_000_000).toString(), reason.trim())}
        >
          Submit claim
        </Button>
      </div>
    </Modal>
  );
}
