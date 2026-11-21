import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { helpHref } from "@/content/help";

export interface ThingToKnow {
  Icon: LucideIcon;
  title: string;
  /** One line; the detail is in the Help Center article. */
  line: string;
  /** Help Center article slug. */
  help: string;
}

/**
 * "Things to know": a short list of icon, title and one line, each opening
 * the full Help Center article. The same on listings and on Invest, so a
 * rule is explained once and looks the same wherever it comes up.
 */
export default function ThingsToKnow({ items, title = "Things to know" }: { items: ThingToKnow[]; title?: string }) {
  return (
    <section>
      <h2 className="mb-1 text-xl font-semibold">{title}</h2>
      <ul className="divide-y divide-borderColor">
        {items.map(({ Icon, title: t, line, help }) => (
          <li key={t}>
            <Link href={helpHref(help)} className="flex items-center gap-4 py-4 hover:bg-cardBackground">
              <Icon size={24} strokeWidth={1.6} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-primaryText">{t}</span>
                <span className="block text-sm text-secondaryText">{line}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-secondaryText" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
