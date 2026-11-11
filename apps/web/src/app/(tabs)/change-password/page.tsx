"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import { useApi } from "@/contexts/ApiContext";

interface Modal {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
  onAction?: () => void;
}

/**
 * Change password while signed in. The current password is checked by the
 * backend (POST /auth/change-password); on mobile it was collected but never
 * sent, so an open session alone could change it.
 */
function ChangePassword() {
  const router = useRouter();
  const { changePassword } = useApi();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [modal, setModal] = useState<Modal>({ visible: false, type: "info", title: "" });
  const close = () => setModal((m) => ({ ...m, visible: false }));
  const fail = (message: string) => setModal({ visible: true, type: "error", title: "Error", message });

  const submit = async () => {
    if (!current || !next || !confirm) return fail("Please fill in all password fields.");
    if (next !== confirm) return fail("New passwords do not match.");
    if (next.length < 8) return fail("Password must be at least 8 characters long.");
    if (next === current) return fail("Choose a password different from your current one.");
    setModal({ visible: true, type: "loading", title: "Changing Password", message: "Please wait while we update your password..." });
    try {
      await changePassword(current, next);
      setModal({
        visible: true,
        type: "success",
        title: "Success",
        message: "Your password has been changed.",
        onAction: () => {
          close();
          router.back();
        },
      });
    } catch (error: any) {
      fail(error?.message || "Failed to change password. Please try again.");
    }
  };

  return (
    <>
      <PageHeader title="Change password" fallback="/profile-setting" />
      <form
        className="mx-auto flex max-w-xl flex-col gap-5 px-5 pb-16 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField label="Current password" isPassword placeholder="Enter current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <TextField label="New password" isPassword placeholder="At least 8 characters" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <TextField label="Confirm new password" isPassword placeholder="Repeat password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" full>
          Change password
        </Button>
      </form>
      <FeedbackModal
        isVisible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onAction={modal.onAction}
        actionLabel={modal.onAction ? "Great" : undefined}
        onClose={modal.type !== "loading" ? close : undefined}
      />
    </>
  );
}

export default function ChangePasswordPage() {
  return (
    <AuthGuard requireAuth>
      <ChangePassword />
    </AuthGuard>
  );
}
