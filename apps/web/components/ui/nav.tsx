"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Today", href: "/" },
  { label: "Plans", href: "/plans" },
  { label: "Progress", href: "/progress" },
  { label: "You", href: "/you" },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex border-t border-hair-08 bg-screen/85 px-5 pt-3 backdrop-blur-[18px]"
      style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="relative flex-1 pt-[6px] text-center"
          >
            <div
              className="mx-auto mb-2 h-[2px] w-[18px]"
              style={{ background: active ? "var(--acc)" : "transparent" }}
            />
            <div
              className="text-[11px] tracking-[.04em]"
              style={{
                fontWeight: active ? 700 : 500,
                color: active ? "var(--color-t1)" : "var(--color-t5)",
              }}
            >
              {tab.label}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="text-[12.5px] font-semibold text-t4 transition-colors hover:text-t1"
    >
      {label}
    </Link>
  );
}
