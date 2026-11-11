"use client";

import { useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import { useApi } from "@/contexts/ApiContext";

interface Modal {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function DeleteAccount() {
  const { deleteAccount } = useApi();
  const [reason, setReason] = useState("");
  const [modal, setModal] = useState<Modal>({ visible: false, type: "info", title: "" });
  const close = () => setModal((m) => ({ ...m, visible: false }));

  const confirm = () =>
    setModal({
      visible: true,
      type: "warning",
      title: "Delete Account",
      message: "Are you sure you want to delete your account? This action cannot be undone.",
      actionLabel: "Delete",
      onAction: async () => {
        setModal({ visible: true, type: "loading", title: "Deleting Account", message: "Please wait while we process your request..." });
        try {
          await deleteAccount();
          window.location.assign("/");
        } catch (error: any) {
          setModal({ visible: true, type: "error", title: "Error", message: error?.message || "Failed to delete account. Please try again." });
        }
      },
    });

  return (
    <>
      <PageHeader title="Delete account" fallback="/profile-setting" />
      <div className="mx-auto max-w-xl px-5 pb-16 pt-8">
        <p className="mb-4 text-sm font-semibold">It&apos;s sad to see you go.</p>
        <p className="text-sm text-secondaryText">
          You will not be able to access this account anymore if you proceed and it cannot be restored.
        </p>
        <label htmlFor="reason" className="sr-only">
          Why are you leaving?
        </label>
        <textarea
          id="reason"
          rows={5}
          placeholder="Tell us why you're leaving"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`${inputClass} mb-3 mt-5`}
        />
        <Button full variant="danger" onClick={confirm}>
          Delete my account
        </Button>
      </div>
      <FeedbackModal
        isVisible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        actionLabel={modal.actionLabel}
        onAction={modal.onAction}
        onClose={modal.type !== "loading" ? close : undefined}
      />
    </>
  );
}

export default function DeleteAccountPage() {
  return (
    <AuthGuard requireAuth>
      <DeleteAccount />
    </AuthGuard>
  );
}
