import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { HELP_ARTICLES, HELP_CATEGORIES, helpHref } from "@/content/help";
import { SUPPORT_EMAIL } from "@/config/support";

/** The Help Center: every explanation the screens keep short, in full. */
export default function HelpCenterPage() {
  return (
    <>
      <PageHeader title="Help Center" fallback="/profile" />
      <div className="mx-auto max-w-xl px-5 pb-20 pt-6">
        <h1 className="text-2xl font-bold">How can we help?</h1>
        <p className="mt-2 text-secondaryText">How Sheda works, what protects your money, and the rules everyone agrees to.</p>

        {HELP_CATEGORIES.map((category) => (
          <section key={category} className="mt-8">
            <h2 className="mb-2 text-lg font-semibold">{category}</h2>
            <ul className="divide-y divide-borderColor border-y border-borderColor">
              {HELP_ARTICLES.filter((a) => a.category === category).map((a) => (
                <li key={a.slug}>
                  <Link href={helpHref(a.slug)} className="flex items-center gap-3 py-4 hover:bg-cardBackground">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-primaryText">{a.title}</span>
                      <span className="mt-0.5 block text-sm text-secondaryText">{a.summary}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-secondaryText" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-10 rounded-2xl bg-cardBackground p-5">
          <h2 className="font-semibold">Still need help?</h2>
          <p className="mt-1 text-sm text-secondaryText">Email us with the property or deal involved, and we&apos;ll look it up.</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Help with Sheda")}`}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            <Mail size={16} /> {SUPPORT_EMAIL}
          </a>
        </section>
      </div>
    </>
  );
}
