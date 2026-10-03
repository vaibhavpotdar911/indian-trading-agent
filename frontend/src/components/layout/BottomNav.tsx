"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Search, History, Settings } from "lucide-react";

const navItems = [
  { href: "/", label: "Today", icon: Home },
  { href: "/recommendations", label: "Picks", icon: Sparkles },
  { href: "/analysis", label: "Analyze", icon: Search },
  { href: "/history", label: "Trades", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-lg border-t border-border/80 z-40 px-2 flex items-center justify-around shadow-2xl">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${
              isActive
                ? "text-primary font-bold bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5 mb-0.5" />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
