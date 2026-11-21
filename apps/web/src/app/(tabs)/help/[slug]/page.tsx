import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { HELP_ARTICLES, helpArticle, helpHref } from "@/content/help";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const article = helpArticle(slug);
  if (!article) notFound();
  const related = (article.related ?? []).map(helpArticle).filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <>
      <PageHeader title="Help Center" fallback="/help" />
      <article className="mx-auto max-w-xl px-5 pb-20 pt-6">
        <p className="text-sm font-medium text-primary">{article.category}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{article.title}</h1>
        <p className="mt-2 text-secondaryText">{article.summary}</p>

        <div className="mt-6 space-y-6">
          {article.sections.map((section, i) => (
            <section key={i}>
              {section.heading ? <h2 className="mb-2 text-lg font-semibold">{section.heading}</h2> : null}
              {section.paragraphs?.map((p, j) => (
                <p key={j} className="mb-3 leading-relaxed text-primaryText/90">
                  {p}
                </p>
              ))}
              {section.bullets ? (
                <ul className="space-y-2.5">
                  {section.bullets.map((b, j) => (
                    <li key={j} className="flex gap-3 leading-relaxed">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-2 text-lg font-semibold">Related</h2>
            <ul className="divide-y divide-borderColor border-y border-borderColor">
              {related.map((a) => (
                <li key={a.slug}>
                  <Link href={helpHref(a.slug)} className="flex items-center gap-3 py-3.5 hover:bg-cardBackground">
                    <span className="min-w-0 flex-1 font-medium">{a.title}</span>
                    <ChevronRight size={18} className="shrink-0 text-secondaryText" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 text-sm text-secondaryText">
          <Link href="/help" className="font-medium text-primaryText underline underline-offset-4">
            All help topics
          </Link>
        </p>
      </article>
    </>
  );
}
