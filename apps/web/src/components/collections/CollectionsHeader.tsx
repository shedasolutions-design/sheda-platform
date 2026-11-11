"use client";

import PageHeader from "@/components/ui/PageHeader";
import { useStackTitle } from "./nav";

/** Back button and the current screen's title. */
export default function CollectionsHeader() {
  const title = useStackTitle();
  return <PageHeader title={title || "Collections"} fallback="/invest" />;
}
