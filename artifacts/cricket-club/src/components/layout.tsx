import { Link, useLocation } from "wouter";
import { Users, ScrollText, Trophy, Award, GitCompare, Menu, X, Crown, Settings, ClipboardList } from "lucide-react";
import { useState } from "react";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";
import { useCurrentAdmin } from "@/lib/admin-auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const me = useCurrentAdmin();

  const navigation = [
    { name: "Honour Boards", href: "/", icon: ScrollText },
    { name: "Players", href: "/players", icon: Users },
    { name: "Matches", href: "/matches", icon: ClipboardList },
    { name: "Grades", href: "/grades", icon: Trophy },
    { name: "Records", href: "/records", icon: Award },
    { name: "Premierships", href: "/premierships", icon: Crown },
    { name: "Compare", href: "/compare", icon: GitCompare },
    ...(me.data ? [{ name: "Admin", href: "/admin", icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-24">
            
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link href="/">
                <img src={logoUrl} alt="Halls Head Cricket Club" className="h-20 w-auto" />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {navigation.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link 
                    key={item.name} 
                    href={item.href} 
                    className={`font-serif text-lg uppercase tracking-wider transition-colors py-2 border-b-2 ${
                      isActive 
                        ? "text-primary border-primary" 
                        : "text-muted-foreground border-transparent hover:text-primary hover:border-primary/50"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
                className="text-primary hover:text-primary/80 focus:outline-none"
              >
                {isMobileMenuOpen ? <X className="h-8 w-8" /> : <Menu className="h-8 w-8" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-card border-t border-border">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navigation.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link 
                    key={item.name} 
                    href={item.href} 
                    className={`block px-3 py-3 rounded-md font-serif text-lg uppercase tracking-wider ${
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-foreground hover:bg-muted"
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full relative z-0">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center md:items-start">
              <img src={logoUrl} alt="Halls Head Cricket Club" className="h-24 w-auto mb-4 grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all" />
              <p className="text-muted-foreground text-sm text-center md:text-left">
                Halls Head Cricket Club<br />
                Peelwood Reserve<br />
                Halls Head WA
              </p>
            </div>
            
            <div className="flex flex-col items-center md:items-start">
              <h3 className="font-serif text-primary uppercase text-lg mb-4 tracking-wider">Quick Links</h3>
              <ul className="space-y-2 text-center md:text-left">
                {navigation.map((item) => (
                  <li key={item.name}>
                    <Link href={item.href} className="text-muted-foreground hover:text-primary transition-colors">
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex flex-col items-center md:items-start">
              <h3 className="font-serif text-primary uppercase text-lg mb-4 tracking-wider">Contact</h3>
              <p className="text-muted-foreground mb-4 text-center md:text-left">
                For club inquiries, please contact us via our official website.
              </p>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Halls Head Cricket Club. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
