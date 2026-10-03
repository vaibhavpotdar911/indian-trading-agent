"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { logout } from "@/lib/api";
import { toast } from "sonner";
import {
  Home,
  Sparkles,
  Radar,
  Target,
  Search,
  CandlestickChart,
  Award,
  FlaskConical,
  History,
  Settings,
  TrendingUp,
  Newspaper,
  Brain,
  PieChart,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Today", icon: Home, hint: "Your daily workflow" },
    ],
  },
  {
    title: "DISCOVER",
    items: [
      { href: "/recommendations", label: "Top Picks", icon: Sparkles, hint: "AI-free recommendations" },
      { href: "/scanner", label: "Market Scan", icon: Radar, hint: "Gap / Volume / Breakout" },
      { href: "/strategies", label: "Strategies", icon: Target, hint: "S/R, Cyclical patterns" },
      { href: "/news", label: "News Feed", icon: Newspaper, hint: "RSS + customizable" },
    ],
  },
  {
    title: "ANALYZE",
    items: [
      { href: "/analysis", label: "Deep Analysis", icon: Search, hint: "AI-powered (paid)" },
      { href: "/equity-portfolio-analysis", label: "Equity portfolio analysis", icon: PieChart, hint: "Kite holdings review" },
      { href: "/charts", label: "Charts", icon: CandlestickChart, hint: "Candlestick charts" },
    ],
  },
  {
    title: "VALIDATE",
    items: [
      { href: "/performance", label: "Performance", icon: Award, hint: "Strategy win rates" },
      { href: "/simulation", label: "Simulation", icon: FlaskConical, hint: "Paper trade + backtest" },
      { href: "/insights", label: "Learning Insights", icon: Brain, hint: "What works for YOU" },
      { href: "/signals", label: "Signal Performance", icon: TrendingUp, hint: "Auto-tune recommender weights" },
      { href: "/verdict-calibration", label: "Verdict Calibration", icon: Target, hint: "Is the daily verdict accurate?" },
      { href: "/confidence-calibration", label: "Confidence Calibration", icon: Award, hint: "Brier score: are probabilities honest?" },
      { href: "/shadow-trades", label: "Shadow Trades", icon: Search, hint: "Counterfactual: trades you skipped" },
      { href: "/memory-admin", label: "Memory Admin", icon: Brain, hint: "Inspect + prune agent BM25 memories" },
      { href: "/backtest", label: "AI Backtest", icon: FlaskConical, hint: "AI on past dates (paid)" },
      { href: "/history", label: "My Trades", icon: History, hint: "Real trades & P&L" },
    ],
  },
  {
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const signOut = async () => {
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Unable to sign out. Please try again.");
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 lg:p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-emerald-500" />
          <div>
            <h1 className="font-bold text-base lg:text-lg tracking-tight">Trading Agent</h1>
            <p className="text-[11px] text-muted-foreground">NSE/BSE Indian Market</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8 text-muted-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.title && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm group transition-all ${
                      isActive
                        ? "bg-accent text-accent-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div>{item.label}</div>
                      {item.hint && !isActive && (
                        <div className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground truncate">
                          {item.hint}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border space-y-3 bg-muted/20">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Appearance</p>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-rose-400 transition-colors pt-1"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Navigation Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card/90 backdrop-blur-md border-b border-border z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open Navigation Menu</span>
          </Button>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            <span className="font-bold text-sm">Trading Agent</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile Backdrop & Slide-over Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-50">
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 border-r border-border flex-col z-40">
        {navContent}
      </aside>
    </>
  );
}

