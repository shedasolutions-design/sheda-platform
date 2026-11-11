"use client";

import {
  Building,
  Building2,
  Castle,
  Construction,
  Home,
  Hotel,
  House,
  Mountain,
  PiggyBank,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { categories } from "@/constants/categories-mock";
import { useApi } from "@/contexts/ApiContext";

/** The mobile list names Material icons; these are their closest equivalents. */
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  apartment: Building2,
  landscape: Mountain,
  hotel: Hotel,
  people: Users,
  villa: Building,
  castle: Castle,
  house: House,
  water: Waves,
  construction: Construction,
  savings: PiggyBank,
};

export default function CategoryList() {
  const { selectedCategory, setSelectedCategory } = useApi();

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-2 [scrollbar-width:none]">
      {categories.map((c) => {
        const selected = selectedCategory === c.name;
        const Icon = ICONS[c.icon] ?? Home;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setSelectedCategory(selected && c.name !== "All" ? "All" : c.name)}
            className={`flex shrink-0 items-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[13px] transition-colors ${
              selected
                ? "border-primary bg-primary text-white"
                : "border-gray-200 bg-primaryLight text-gray-500 hover:border-gray-300"
            }`}
          >
            <Icon size={16} />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
