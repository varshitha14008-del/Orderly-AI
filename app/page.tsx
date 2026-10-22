import Link from "next/link";
import { ShieldCheck, Sparkles, Scale, ArrowRight, Zap, CheckCircle2, Lock, FileCode, Check } from "lucide-react";
import { SEEDED_PRODUCTS } from "@/lib/negotiation/catalog";

export default function HomePage() {
  return (
    <div className="space-y-12 py-4">
      {/* Hero Section */}
      <section className="text-center space-y-6 max-w-4xl mx-auto pt-6 pb-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold tracking-wide uppercase">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          PayPal AI Hackathon 2026 Submission
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
          Where Autonomous AI Agents <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-amber-300 bg-clip-text text-transparent">
            Negotiate & Settle on PayPal
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Orderly-AI provides a safe, deterministic guardrail for agentic commerce:{" "}
          <strong className="text-white font-semibold">The LLM proposes, our policy engine disposes, human buyers approve, and PayPal settles.</strong>
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/buyer"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-paypal-blue to-cyan-500 hover:from-cyan-600 hover:to-paypal-blue text-white font-semibold shadow-lg shadow-paypal-blue/30 hover:shadow-cyan-500/40 transition-all hover:-translate-y-0.5"
          >
            <Sparkles className="w-5 h-5" />
            <span>Launch Buyer Negotiation</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl glass-panel hover:bg-white/10 text-slate-200 font-semibold border border-white/15 transition-all"
          >
            <span>View AG Grid Audit Ledger</span>
          </Link>
          <Link
            href="/demo"
            className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-cyan-300 font-medium border border-cyan-500/30 transition-all"
          >
            <span>Demo Control Panel</span>
          </Link>
        </div>
      </section>

      {/* Architecture Visual Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
        <div className="glass-panel p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-cyan-500/40 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-white">1. Buyer Agent</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Autonomous agent armed with user policy (max ceiling, auto-accept limits, no subscriptions). Formulates opening offers and counter-offers via Gemini 3.5.
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-3 relative overflow-hidden border-cyan-500/30 group hover:border-cyan-400 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-white">2. Policy Engine</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Pure TypeScript guardrail intercepts every token. Prohibits prices above buyer max or below seller floor, enforces bundle rules, and blocks unauthorized claims.
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-white">3. PayPal Settlement</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            On mutual agreement, a real PayPal Orders v2 order is created. The human buyer authorizes via native PayPal Buttons, and our backend captures the payment.
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl space-y-3 relative overflow-hidden group hover:border-purple-500/40 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
            <Scale className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-white">4. Mediator & Audit</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Post-purchase disputes are evaluated by an impartial AI Mediator citing exact clauses. Every turn and financial event is recorded in a SHA-256 hash-chained ledger.
          </p>
        </div>
      </section>

      {/* Seeded Catalog Section */}
      <section className="space-y-6 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Available Marketplace Inventory</h2>
            <p className="text-sm text-slate-400">
              Select any item to launch a live autonomous multi-round negotiation between agents.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full self-start sm:self-auto border border-white/5">
            4 Seeded Products Ready
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SEEDED_PRODUCTS.map((prod) => (
            <div
              key={prod.id}
              className="glass-panel rounded-2xl p-5 flex flex-col justify-between hover:border-cyan-500/30 transition-all hover:-translate-y-1"
            >
              <div className="space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-md border border-cyan-500/20">
                  {prod.category}
                </span>
                <h3 className="text-lg font-bold text-white leading-snug">{prod.title}</h3>
                <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{prod.description}</p>
              </div>

              <div className="pt-6 space-y-4">
                <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">List Price</span>
                    <span className="text-xl font-bold text-white">${prod.listPrice.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase block">Merchant Floor</span>
                    <span className="text-sm font-semibold text-amber-400">${prod.floorPrice.toFixed(2)}</span>
                  </div>
                </div>

                <Link
                  href={`/buyer?product=${prod.id}`}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-cyan-500 text-white text-xs font-semibold hover:text-black transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Negotiate This Item</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Judging Criteria Alignment Bar */}
      <section className="glass-panel-glow rounded-2xl p-6 sm:p-8 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          Engineered for the PayPal AI Hackathon Submission Requirements
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">Real PayPal Sandbox Integration</strong>
              Real Orders v2 (intent: CAPTURE), native PayPal JS buttons, and Payments v2 capture refunds.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">Meaningful Agentic Commerce</strong>
              Two-sided multi-turn negotiation with structured JSON schemas, policy validation, and fallback resilience.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white block font-medium">AG Grid & Tamper-Evident Ledger</strong>
              Full AG Grid Community audit dashboard backed by SHA-256 cryptographic prev_hash chaining.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
