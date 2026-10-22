"use client";

import React, { useState, useEffect } from "react";
import {
  Scale,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  DollarSign,
  FileText,
  BadgeAlert,
  ArrowRight,
} from "lucide-react";
import { SEEDED_PRODUCTS } from "@/lib/negotiation/catalog";
import { NegotiationSession } from "@/lib/negotiation/engine";
import { MediationRecommendation } from "@/lib/agents/mediator";

export default function MerchantHubPage() {
  const [sessions, setSessions] = useState<NegotiationSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [disputeCategory, setDisputeCategory] = useState<"not_as_described" | "damaged" | "changed_mind">("damaged");
  const [disputeNotes, setDisputeNotes] = useState<string>("Product arrived with loose keycaps and scratches on casing.");

  const [mediating, setMediating] = useState<boolean>(false);
  const [recommendation, setRecommendation] = useState<MediationRecommendation | null>(null);
  const [refundStatus, setRefundStatus] = useState<string>("");
  const [refundResult, setRefundResult] = useState<any>(null);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/negotiations");
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
        if (data.sessions.length > 0 && !selectedSessionId) {
          setSelectedSessionId(data.sessions[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRunMediation = async () => {
    if (!selectedSessionId) return;
    setMediating(true);
    setRecommendation(null);
    setRefundStatus("");
    setRefundResult(null);

    try {
      const res = await fetch("/api/disputes/mediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          category: disputeCategory,
          notes: disputeNotes,
        }),
      });

      const data = await res.json();
      if (data.recommendation) {
        setRecommendation(data.recommendation);
      } else {
        alert(data.error || "Mediation failed");
      }
    } catch (err: any) {
      alert(`Mediation error: ${err.message}`);
    } finally {
      setMediating(false);
    }
  };

  const handleExecuteRefund = async () => {
    if (!recommendation) return;
    const session = sessions.find((s) => s.id === selectedSessionId);
    const captureId = session?.paypalCaptureId || "MOCK_SANDBOX_CAPTURE";

    setRefundStatus("Executing PayPal Payments v2 refund...");

    try {
      const res = await fetch("/api/disputes/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSessionId,
          captureId,
          amount: recommendation.refund_amount,
          note: `Approved via Orderly-AI AI Mediator: ${recommendation.decision}`,
        }),
      });

      const data = await res.json();
      if (data.refund) {
        setRefundResult(data.refund);
        setRefundStatus(`Refund successfully executed in PayPal Sandbox! ID: ${data.refund.id}`);
        fetchSessions();
      } else {
        setRefundStatus(`Refund failed: ${data.error}`);
      }
    } catch (err: any) {
      setRefundStatus(`Refund request error: ${err.message}`);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Scale className="w-7 h-7 text-amber-400" />
            Merchant Operations & Dispute Hub
          </h1>
          <p className="text-sm text-slate-400">
            Monitor floor price margins, view captured PayPal orders, and resolve disputes via AI Mediator.
          </p>
        </div>
        <button
          onClick={fetchSessions}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-white/10 transition-colors self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Top Cards: Merchant Policies Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Floor Price Policy</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">$45.00 min</div>
          <p className="text-xs text-slate-400">
            Strict policy prevents Seller Agent from countering or accepting below $45.00 floor.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bundle Discounts</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">Qty 2+ → 20% max</div>
          <p className="text-xs text-slate-400">
            Validated by policy engine before proposals reach prospective buyers.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Refund Rules</span>
            <Scale className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-medium text-slate-300 space-y-1">
            <div className="flex justify-between text-xs">
              <span>Not As Described:</span>
              <strong className="text-emerald-400">100% Full</strong>
            </div>
            <div className="flex justify-between text-xs">
              <span>Damaged in Transit:</span>
              <strong className="text-amber-400">50% Partial</strong>
            </div>
            <div className="flex justify-between text-xs">
              <span>Buyer Remorse:</span>
              <strong className="text-rose-400">Contest</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Section: Captured Orders & AI Dispute Mediation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Recent Orders List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-cyan-400" />
            Marketplace Deals & Orders ({sessions.length})
          </h2>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {sessions.length === 0 ? (
              <div className="glass-panel rounded-2xl p-6 text-center text-slate-500 text-xs">
                No negotiations created yet. Head over to the{" "}
                <a href="/buyer" className="text-cyan-400 underline">
                  Buyer Portal
                </a>{" "}
                to initiate one!
              </div>
            ) : (
              sessions.map((s) => {
                const isSelected = s.id === selectedSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`glass-panel rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected
                        ? "border-amber-500/60 bg-slate-800/80 shadow-md shadow-amber-500/10"
                        : "hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white">{s.product.title}</h3>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          ID: {s.id.substring(0, 16)}...
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          s.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : s.status === "AGREED"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-3 pt-2.5 border-t border-white/5 text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase block">Settlement Price</span>
                        <span className="font-bold text-white">
                          {s.agreedPrice ? `$${s.agreedPrice.toFixed(2)}` : "Pending"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 text-[10px] uppercase block">PayPal Capture</span>
                        <span className="font-mono text-cyan-400 text-[11px]">
                          {s.paypalCaptureId ? s.paypalCaptureId.substring(0, 12) + "..." : "None"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: AI Dispute Mediator & Resolution (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="glass-panel rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <BadgeAlert className="w-4 h-4 text-amber-400" />
                AI Mediator & Dispute Resolution
              </h2>
              <span className="text-[10px] text-cyan-300 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                Gemini 3.5 Arbiter
              </span>
            </div>

            {selectedSession ? (
              <div className="space-y-4">
                {/* Selected Order Context */}
                <div className="bg-slate-900/70 rounded-xl p-3.5 border border-white/5 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Selected Transaction</span>
                    <strong className="text-white text-sm">{selectedSession.product.title}</strong>
                    <span className="text-slate-400 block mt-0.5">
                      Settlement: ${selectedSession.agreedPrice?.toFixed(2) || selectedSession.product.listPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <span className="text-slate-500 block text-[10px]">CAPTURE STATUS</span>
                    <span className="text-emerald-400 font-bold">
                      {selectedSession.paypalCaptureId ? "CAPTURED" : "SIMULATED / PENDING"}
                    </span>
                  </div>
                </div>

                {/* Dispute Scenario Form */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Select Dispute Category to Simulate & Mediate:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDisputeCategory("not_as_described");
                        setDisputeNotes("Item model differs from specification in listing.");
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition-all ${
                        disputeCategory === "not_as_described"
                          ? "bg-cyan-500/20 border-cyan-400 text-white"
                          : "bg-slate-900 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      Not As Described
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisputeCategory("damaged");
                        setDisputeNotes("Product arrived with loose keycaps and scratches on casing.");
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition-all ${
                        disputeCategory === "damaged"
                          ? "bg-amber-500/20 border-amber-400 text-white"
                          : "bg-slate-900 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      Damaged in Transit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDisputeCategory("changed_mind");
                        setDisputeNotes("Customer decided they no longer need the item.");
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-center transition-all ${
                        disputeCategory === "changed_mind"
                          ? "bg-rose-500/20 border-rose-400 text-white"
                          : "bg-slate-900 border-white/10 text-slate-400 hover:text-white"
                      }`}
                    >
                      Buyer Remorse
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Buyer Claim Notes:</label>
                    <input
                      type="text"
                      value={disputeNotes}
                      onChange={(e) => setDisputeNotes(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <button
                    onClick={handleRunMediation}
                    disabled={mediating}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <Sparkles className="w-4 h-4 fill-current" />
                    <span>{mediating ? "Mediator Reviewing Transcript..." : "Request AI Mediator Ruling"}</span>
                  </button>
                </div>

                {/* Recommendation Result Card */}
                {recommendation && (
                  <div className="glass-panel-glow rounded-xl p-5 space-y-4 border-amber-500/40 mt-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block">Mediator Ruling</span>
                        <h4
                          className={`text-base font-extrabold uppercase ${
                            recommendation.decision === "full_refund"
                              ? "text-emerald-400"
                              : recommendation.decision === "partial_refund"
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {recommendation.decision.replace("_", " ")}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase block">Recommended Refund</span>
                        <span className="text-xl font-black text-white">
                          ${recommendation.refund_amount.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold block">Objective Reasoning:</span>
                        <p className="text-slate-200 mt-0.5 leading-relaxed">{recommendation.reasoning}</p>
                      </div>

                      <div className="pt-2 border-t border-white/5">
                        <span className="text-slate-400 font-semibold block">Policy Clauses Cited:</span>
                        <ul className="list-disc list-inside space-y-1 text-cyan-300 mt-1 font-mono text-[11px]">
                          {recommendation.policy_clauses_cited.map((clause, i) => (
                            <li key={i}>{clause}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Merchant Approval & Execution */}
                    <div className="pt-3 border-t border-white/10 space-y-3">
                      <button
                        onClick={handleExecuteRefund}
                        className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-bold text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>1-Click Approve Ruling & Settle in PayPal</span>
                      </button>

                      {refundStatus && (
                        <div className="p-3 rounded-lg bg-slate-900 border border-white/10 text-xs font-mono text-emerald-300">
                          {refundStatus}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                Select an order from the left to inspect or initiate dispute mediation.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
