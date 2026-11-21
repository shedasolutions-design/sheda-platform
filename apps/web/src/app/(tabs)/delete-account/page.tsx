"use client";

import { useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import { useApi } from "@/contexts/ApiContext";
import EmailCodeModal from "@/components/common/EmailCodeModal";

interface Modal {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function DeleteAccount() {
  const { deleteAccount, user } = useApi();
  const [askCode, setAskCode] = useState(false);
  const [reason, setReason] = useState("");
  const [modal, setModal] = useState<Modal>({ visible: false, type: "info", title: "" });
  const close = () => setModal((m) => ({ ...m, visible: false }));

  const confirm = () =>
    setModal({
      visible: true,
      type: "warning",
      title: "Delete Account",
      message: "Are you sure you want to delete your account? This action cannot be undone.",
      actionLabel: "Continue",
      // Closing an account needs the emailed code, not just an open session.
      onAction: () => {
        close();
        setAskCode(true);
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
      <EmailCodeModal
        open={askCode}
        title="Confirm it's you"
        reason="Deleting your account can't be undone."
        email={user?.email}
        confirmLabel="Delete my account"
        onClose={() => setAskCode(false)}
        onCode={async (code) => {
          await deleteAccount(code);
          window.location.assign("/");
        }}
      />
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
