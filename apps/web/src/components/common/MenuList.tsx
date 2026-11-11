import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

export interface MenuItem {
  key: string;
  icon: LucideIcon;
  label: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

/** A list of navigation rows, as in the profile and settings screens. */
export default function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="divide-y divide-borderColor/60 border-y border-borderColor/60">
      {items.map(({ key, icon: Icon, label, href, onClick, chevron = true, danger, disabled }) => {
        const inner = (
          <>
            <span className="flex items-center gap-3">
              <Icon size={20} className={danger ? "text-red-600" : ""} />
              <span className={`text-base ${danger ? "text-red-600" : ""}`}>{label}</span>
            </span>
            {chevron && <ChevronRight size={18} className="text-secondaryText" />}
          </>
        );
        const cls = "flex w-full items-center justify-between px-5 py-4 text-left hover:bg-cardBackground disabled:opacity-50";
        return (
          <li key={key}>
            {href ? (
              <Link href={href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button type="button" onClick={onClick} disabled={disabled} className={cls}>
                {inner}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
