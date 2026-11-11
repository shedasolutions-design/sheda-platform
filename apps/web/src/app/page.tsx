"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Splash } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useShedaApi";

/** Welcome screen. A returning, signed-in visitor goes straight home. */
export default function Welcome() {
  const { isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitializing && isAuthenticated) router.replace("/home");
  }, [isAuthenticated, isInitializing, router]);

  if (isInitializing || isAuthenticated) return <Splash />;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div
        className="min-h-[55vh] flex-[6] bg-cover bg-center md:min-h-screen"
        style={{ backgroundImage: "url(/images/hero.png)" }}
        role="img"
        aria-label="A modern residential building"
      />
      <div className="relative -mt-5 flex flex-[4] flex-col justify-center rounded-t-3xl bg-[#F9FAFB] p-6 md:mt-0 md:rounded-none md:p-12">
        <div className="mx-auto w-full max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/sheda-logo.png" alt="Sheda" className="mb-8 hidden h-9 w-auto md:block" />
          <div className="text-center md:text-left">
            <h1 className="mb-2 text-xl font-semibold md:text-3xl">Welcome to advanced real estate</h1>
            <p className="text-sm text-secondaryText md:text-base">
              Sheda solutions makes your real estate operations very easy and stress-free.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <ButtonLink href="/login" full>
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" variant="outline" full>
              Create account
            </ButtonLink>
            <Link
              href="/home"
              className="mt-3 text-center text-sm text-secondaryText underline hover:text-primaryText"
            >
              Skip for now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
