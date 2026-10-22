"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sliders,
  Database,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Scale,
  LayoutDashboard,
  Zap,
} from "lucide-react";

export default function DemoControlPage() {
  const [loading, setLoading] = useState<boolean>(false);
  const [actionOutput, setActionOutput] = useState<string>("");

  const handleSeedData = async () => {
    setLoading(true);
    setActionOutput("Seeding realistic multi-round negotiation deal with real sandbox order...");
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" });
      const data = await res.json();
      setActionOutput(
        `✓ Seed Successful! Created Session ${data.session.id} for ${data.session.product.title} (Settled at $${data.session.agreedPrice.toFixed(2)}).`
      );
    } catch (err: any) {
      setActionOutput(`Failed to seed data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetData = async () => {
    if (!confirm("Are you sure you want to reset all active negotiations and audit ledger?")) return;
    setLoading(true);
    setActionOutput("Resetting marketplace sessions and initializing genesis block...");
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json();
      setActionOutput(`✓ ${data.message}`);
    } catch (err: any) {
      setActionOutput(`Reset error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setLoading(true);
    setActionOutput("Pulling one-shot live transaction status from PayPal Sandbox API...");
    try {
      const res = await fetch("/api/demo/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "49A309481M497412U" }),
      });
      const data = await res.json();
      if (data.order) {
        setActionOutput(
          `✓ PayPal Sandbox Synced! Order ${data.order.id} is ${data.order.status} for ${data.order.purchase_units?.[0]?.amount?.value} ${data.order.purchase_units?.[0]?.amount?.currency_code}. Recorded in audit log.`
        );
      } else {
        setActionOutput(`Sync response: ${data.error}`);
      }
    } catch (err: any) {
      setActionOutput(`Sync failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Sliders className="w-7 h-7 text-cyan-400" />
            Demo Control Panel
          </h1>
          <p className="text-sm text-slate-400">
            One-click controls for judges and video rehearsal: seed realistic data, reset ledger, or pull live sandbox sync.
          </p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 self-start sm:self-auto">
          Rehearsal & Evaluation Hub
        </span>
      </div>

      {/* Control Buttons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Seed Data Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Seed Golden Demo Deal</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Populates a multi-turn negotiated keyboard deal, pre-linked with live PayPal Sandbox Order{" "}
              <code className="text-cyan-300 font-mono">49A309481M497412U</code>.
            </p>
          </div>

          <button
            onClick={handleSeedData}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-paypal-blue hover:from-cyan-400 hover:to-paypal-blue text-white text-xs font-bold transition-all shadow-md shadow-cyan-500/20"
          >
            Seed Golden Deal
          </button>
        </div>

        {/* Sync Now Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Sync Now (PayPal Pull)</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Triggers a one-shot live REST request to PayPal Sandbox to verify and reconcile order status and log into the audit chain.
            </p>
          </div>

          <button
            onClick={handleSyncNow}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
          >
            Sync from PayPal Sandbox
          </button>
        </div>

        {/* Reset State Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-white">Reset Marketplace</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Clears all in-memory negotiation sessions and initializes a fresh cryptographic genesis block on the audit ledger.
            </p>
          </div>

          <button
            onClick={handleResetData}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-bold transition-colors"
          >
            Reset All Sessions
          </button>
        </div>
      </div>

      {/* Action Output Console */}
      {actionOutput && (
        <div className="glass-panel-glow rounded-xl p-4 text-xs font-mono text-cyan-300 border-cyan-500/30 flex items-start gap-2.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 mt-1 shrink-0 animate-ping"></span>
          <span>{actionOutput}</span>
        </div>
      )}

      {/* Navigation Shortcuts for Demo Walkthrough */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          3-Minute Demo Video Walkthrough Links
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/buyer"
            className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 space-y-1 block transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white group-hover:text-cyan-400">1. Buyer Portal</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <p className="text-[11px] text-slate-400">Set buyer policy, negotiate live, approve in PayPal.</p>
          </Link>

          <Link
            href="/merchant"
            className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 space-y-1 block transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white group-hover:text-amber-400">2. Merchant Hub</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <p className="text-[11px] text-slate-400">Review floor rules, simulate claim, approve AI refund.</p>
          </Link>

          <Link
            href="/admin"
            className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 space-y-1 block transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white group-hover:text-emerald-400">3. AG Grid Dashboard</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <p className="text-[11px] text-slate-400">Inspect cryptographic prev_hash audit trail.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
