"use client";

import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { CATEGORY_ICONS } from "@/components/property/CategoryList";
import { categories } from "@/constants/categories-mock";
import { useApi } from "@/contexts/ApiContext";

export default function CategoriesPage() {
  const router = useRouter();
  const { setSelectedCategory } = useApi();
  const pick = (name: string) => {
    setSelectedCategory(name);
    router.push("/home");
  };
  return (
    <>
      <PageHeader title="Browse Categories" />
      <div className="mx-auto max-w-4xl px-5 pb-16 pt-4">
        <p className="mb-5 text-[13px] text-gray-500">Pick a category to find properties that match</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c.icon] ?? Home;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c.name)}
                  className="h-full w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-active">
                    <Icon size={26} className="text-primary" />
                  </span>
                  <span className="line-clamp-2 block text-sm font-medium">{c.name}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-gray-500">{c.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
