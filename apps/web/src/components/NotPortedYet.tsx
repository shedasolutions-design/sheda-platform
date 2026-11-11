"use client";

import { usePathname } from "next/navigation";
import { Construction } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";

/** The Expo web build, which still has every screen while the move finishes. */
const LEGACY_APP = "https://sheda-solution-mobile--sheda-tt.expo.app";

/**
 * Stand-in for a screen that has not moved from apps/mobile yet. It links to
 * the same path on the live Expo build, whose routes match these one for one.
 * Delete each use as the real page lands; see apps/web/README.md for the list.
 */
export default function NotPortedYet({ title, withHeader = false }: { title: string; withHeader?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {withHeader && <PageHeader title={title} />}
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
        <Construction size={44} className="mb-4 text-secondaryText" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-secondaryText">
          This screen is still moving over to the new web app. It works today in the current app.
        </p>
        <ButtonLink
          href={`${LEGACY_APP}${pathname}`}
          variant="outline"
          className="mt-6"
        >
          Open in the current app
        </ButtonLink>
      </div>
    </>
  );
}
