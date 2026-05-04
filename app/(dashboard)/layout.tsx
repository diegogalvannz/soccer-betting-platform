"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Target,
  Calendar,
  BookOpen,
  BarChart3,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Panel",       shortLabel: "Panel",       icon: LayoutDashboard },
  { href: "/picks",     label: "Pronósticos", shortLabel: "Pronóst.",    icon: Target },
  { href: "/matches",   label: "Partidos",    shortLabel: "Partidos",    icon: Calendar },
  { href: "/tracker",   label: "Apuestas",    shortLabel: "Apuestas",    icon: BookOpen },
  { href: "/analytics", label: "Analíticas",  shortLabel: "Analíticas",  icon: BarChart3 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-64 border-r border-border flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⚽</span>
            <div>
              <p className="font-bold text-sm leading-none tracking-tight">Soccer Intel</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Plataforma de Apuestas</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-all"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto min-h-screen">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚽</span>
            <span className="font-bold text-sm tracking-tight">Soccer Intel</span>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Page content — extra bottom padding on mobile for the nav bar */}
        <div className="p-4 md:p-8 pb-24 md:pb-8">{children}</div>
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border">
        <div className="flex items-center justify-around px-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[56px] transition-all",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} />
                <span className={cn(
                  "text-[10px] font-medium leading-tight",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.shortLabel}
                </span>
                {isActive && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
