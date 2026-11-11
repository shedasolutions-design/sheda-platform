import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { SUPPORT_EMAIL } from "@/config/support";

/**
 * Help. The mobile screen was an unfinished chat placeholder whose buttons did
 * nothing; there is no support endpoint on the backend. Email is the channel
 * the transactional emails already point people to.
 */
export default function SupportPage() {
  return (
    <>
      <PageHeader title="Sheda support" fallback="/profile" />
      <div className="mx-auto max-w-xl px-5 pb-16 pt-6">
        <h2 className="text-base font-medium">How can we help?</h2>
        <p className="mt-2 text-sm text-secondaryText">
          Questions about a listing, a payment, a viewing or your wallet? Email us and include the property or transaction
          involved, so we can look it up straight away.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Help with Sheda")}`}
            className="flex items-center gap-3 rounded-xl border border-borderColor p-4 hover:bg-cardBackground"
          >
            <Mail size={20} className="text-primary" />
            <span>
              <span className="block font-medium">Email support</span>
              <span className="block text-sm text-secondaryText">{SUPPORT_EMAIL}</span>
            </span>
          </a>
          <Link href="/support-feedback" className="flex items-center gap-3 rounded-xl border border-borderColor p-4 hover:bg-cardBackground">
            <MessageSquare size={20} className="text-primary" />
            <span>
              <span className="block font-medium">Send feedback</span>
              <span className="block text-sm text-secondaryText">Tell us what to improve</span>
            </span>
          </Link>
        </div>
        <p className="mt-6 text-xs text-secondaryText">
          Never share your recovery phrase or private key with anyone, including Sheda staff. We will never ask for it.
        </p>
      </div>
    </>
  );
}
