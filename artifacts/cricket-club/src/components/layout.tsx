import { Link, useLocation } from "wouter";
import { Users, LayoutDashboard, Trophy, Award, Menu, X } from "lucide-react";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Players", href: "/players", icon: Users },
    { name: "Grades", href: "/grades", icon: Trophy },
    { name: "Records", href: "/records", icon: Award },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="font-serif font-bold text-xl tracking-tighter text-primary">HHCC Stats</div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 -mr-2">
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`md:w-64 bg-card border-r flex flex-col transition-all duration-300 ${isMobileMenuOpen ? 'h-auto opacity-100 border-b' : 'h-0 opacity-0 overflow-hidden md:h-screen md:opacity-100 md:border-b-0'}`}>
        <div className="p-6 hidden md:block">
          <h1 className="font-serif font-extrabold text-2xl tracking-tighter text-primary">
            Halls Head<br />Cricket Club
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono uppercase tracking-wider">Est. 1991</p>
        </div>
        <nav className="flex-1 px-4 py-4 md:py-0 space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${isActive ? "bg-primary text-primary-foreground font-medium" : "text-foreground hover:bg-secondary"}`} onClick={() => setIsMobileMenuOpen(false)}>
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
