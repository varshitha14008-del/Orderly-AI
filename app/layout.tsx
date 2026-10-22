import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ShieldCheck, Sparkles, Scale, LayoutDashboard, Sliders } from "lucide-react";

export const metadata: Metadata = {
  title: "Orderly-AI | Two-Sided Agent Marketplace on PayPal",
  description:
    "Policy-bounded autonomous commerce: Buyer & Seller AI agents negotiate deals, settle securely via PayPal Sandbox, and resolve disputes via AI Mediator.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col">
        {/* Top Navigation */}
        <header className="sticky top-0 z-50 glass-panel border-b border-white/10 px-4 lg:px-8 py-3.5 transition-all">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-paypal-blue to-cyan-400 p-0.5 shadow-lg shadow-paypal-blue/30 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  Orderly<span className="text-cyan-400">.AI</span>
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-paypal-blue/20 text-cyan-300 border border-paypal-blue/30">
                  PayPal Agent Marketplace
                </span>
              </div>
            </Link>

            {/* Nav items */}
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/buyer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Buyer Portal</span>
              </Link>
              <Link
                href="/merchant"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Scale className="w-4 h-4 text-amber-400" />
                <span>Merchant Hub</span>
              </Link>
              <Link
                href="/admin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                <span>AG Grid Audit</span>
              </Link>
              <Link
                href="/demo"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-paypal-blue/30 text-cyan-300 hover:bg-paypal-blue/40 border border-paypal-blue/40 transition-colors"
              >
                <Sliders className="w-4 h-4" />
                <span className="hidden sm:inline">Demo Control</span>
              </Link>
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-white/5 py-6 px-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>
              Built for <strong className="text-slate-300">PayPal AI Hackathon 2026</strong>. Powered by PayPal Sandbox Orders & Payments v2 + Google Gemini 3.5.
            </p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Sandbox Mode Active
              </span>
              <a
                href="https://github.com/varshitha14008-del/Orderly-AI"
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-white underline underline-offset-4"
              >
                GitHub Repository
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
