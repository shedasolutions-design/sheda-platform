"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import TextField from "@/components/ui/TextField";
import LocationField from "@/components/ui/LocationField";
import FeedbackModal, { type FeedbackType } from "@/components/ui/FeedbackModal";
import Avatar from "@/components/common/Avatar";
import { useApi } from "@/contexts/ApiContext";
import { useMode } from "@/contexts/ModeContext";
import AsyncStorage from "@/lib/storage";
import { fileToAsset } from "@/lib/files";

interface Modal {
  visible: boolean;
  type: FeedbackType;
  title: string;
  message?: string;
}

function PersonalInfo() {
  const router = useRouter();
  const { user, getMe, updateMe, uploadFile } = useApi();
  const { isSeller } = useMode();
  const [location, setLocation] = useState("");
  const [avatar, setAvatar] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<Modal>({ visible: false, type: "info", title: "" });
  const show = (type: FeedbackType, title: string, message?: string) => setModal({ visible: true, type, title, message });
  const hide = () => setModal((m) => ({ ...m, visible: false }));
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMe({ silent: true }).catch(() => {});
  }, [getMe]);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullname || "");
    setAgencyName(user.agency_name || "");
    setPhone(user.phone_number || "");
    setEmail(user.email || "");
    setLocation(user.location || "");
    setAvatar(user.avatar_url || "");
  }, [user]);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return show("error", "Not an image", "Choose a JPG, PNG or WebP photo.");
    try {
      show("loading", "Uploading Image", "Please wait while we upload your profile picture...");
      const uploaded = await uploadFile("profile", fileToAsset(file));
      setAvatar(uploaded.file_url.includes("?t=") ? uploaded.file_url : `${uploaded.file_url}?t=${Date.now()}`);
      hide();
    } catch {
      show("error", "Upload Failed", "Failed to upload image. Please try again.");
    }
  };

  const save = async () => {
    if (!user) return;
    let formatted = phone.trim();
    if (formatted) {
      formatted = `+${formatted.replace(/^\+/, "").replace(/\D/g, "")}`;
      if (formatted.length < 11 || formatted.length > 16) {
        return show(
          "error",
          "Invalid Phone Number",
          "Phone number must include country code and be between 10 to 15 digits (e.g., +23480...)"
        );
      }
    }
    setSaving(true);
    show("loading", "Saving Changes", "We're updating your profile info...");
    try {
      const update: Record<string, unknown> = {
        fullname: fullName,
        phone_number: formatted,
        email,
        location,
        account_type: user.account_type || "client",
      };
      if (isSeller) update.agency_name = agencyName.trim();
      if (avatar) update.avatar_url = avatar;
      await updateMe(update as any);
      // Property pages cache agent profiles; drop ours so the change shows.
      if (user.id) AsyncStorage.removeItem(`agent_cache_${user.id}`).catch(() => {});
      show("success", "Profile Updated", "Your changes have been saved successfully!");
      setTimeout(() => {
        hide();
        router.back();
      }, 1500);
    } catch (err: any) {
      show("error", "Update Failed", err?.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Profile Info" fallback="/profile" />
      <div className="mx-auto max-w-xl px-5 pb-16 pt-5">
        <div className="mb-6 flex justify-center">
          <div className="relative">
            <Avatar url={avatar} name={user?.fullname || user?.username} size={100} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Change profile photo"
              className="absolute bottom-0 right-0 rounded-full border border-borderColor bg-white p-2 shadow hover:bg-cardBackground"
            >
              <Pencil size={16} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <TextField label="Full Name" placeholder="Enter your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          {isSeller && (
            <TextField
              label="Agency Name (optional)"
              placeholder="Enter agency name (if any)"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              autoComplete="organization"
            />
          )}
          <TextField label="Phone number" type="tel" placeholder="+234..." value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <TextField label="Email" type="email" placeholder="Enter email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <LocationField value={location} onChange={setLocation} />
          <TextField label="KYC status" value={user?.kyc_status || "Pending verification"} disabled readOnly />
          <Button type="submit" full loading={saving} className="mt-2">
            Save changes
          </Button>
        </form>
      </div>

      <FeedbackModal
        isVisible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={modal.type !== "loading" ? hide : undefined}
      />
    </>
  );
}

export default function PersonalInfoPage() {
  return (
    <AuthGuard requireAuth>
      <PersonalInfo />
    </AuthGuard>
  );
}
