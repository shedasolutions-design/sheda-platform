"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerRouter } from "@/lib/router";

/** Hands the live Next router to the global `router` in lib/router.ts. */
export default function RouterBridge(): null {
  const r = useRouter();
  useEffect(() => {
    registerRouter(r);
  }, [r]);
  return null;
}
