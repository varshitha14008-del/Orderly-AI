"use client";

import React, { useState, useEffect } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  Play,
  FastForward,
  Scale,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { SEEDED_PRODUCTS, MarketplaceProduct } from "@/lib/negotiation/catalog";
import { BuyerPolicy } from "@/lib/policy/types";
import { NegotiationSession, NegotiationTurnRecord } from "@/lib/negotiation/engine";

export default function BuyerPortalPage() {
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct>(SEEDED_PRODUCTS[0]);
  const [maxPrice, setMaxPrice] = useState<number>(60);
  const [autoAcceptBelow, setAutoAcceptBelow] = useState<number>(40);
  const [askHumanAbove, setAskHumanAbove] = useState<number>(50);
  const [noSubscriptions, setNoSubscriptions] = useState<boolean>(true);

  const [session, setSession] = useState<NegotiationSession | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [orderCaptured, setOrderCaptured] = useState<boolean>(false);
  const [captureDetails, setCaptureDetails] = useState<{ orderId: string; captureId: string } | null>(null);

  // Initialize or fetch initial product from URL param if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const prodId = urlParams.get("product");
      if (prodId) {
        const found = SEEDED_PRODUCTS.find((p) => p.id === prodId);
        if (found) setSelectedProduct(found);
      }
    }
  }, []);

  const handleStartNegotiation = async () => {
    setLoading(true);
    setStatusMessage("Initializing session with configured buyer policy...");
    setOrderCaptured(false);
    setCaptureDetails(null);

    try {
      const buyerPolicy: BuyerPolicy = {
        max_price: Number(maxPrice),
        auto_accept_below: Number(autoAcceptBelow),
        ask_human_above: Number(askHumanAbove),
        no_subscriptions: noSubscriptions,
        forbidden_terms: ["crypto", "non-refundable"],
      };

      const res = await fetch("/api/negotiations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          buyerPolicy,
        }),
      });

      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setStatusMessage("Session initialized! Click 'Next Turn' or 'Auto-Negotiate'.");
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNextStep = async () => {
    if (!session) return;
    setLoading(true);
    setStatusMessage("Executing agent turn with Gemini 3.5 & Policy Guardrails...");

    try {
      const res = await fetch(`/api/negotiations/${session.id}/step`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        if (data.session.status === "AGREED" || data.session.status === "AWAITING_HUMAN_APPROVAL") {
          setStatusMessage(`Agreement reached at $${data.session.agreedPrice?.toFixed(2)}! Authorize via PayPal below.`);
        } else if (data.session.status === "REJECTED") {
          setStatusMessage("Negotiation ended without agreement.");
        } else {
          setStatusMessage(`Completed Turn #${data.session.turns.length}.`);
        }
      }
    } catch (err: any) {
      setStatusMessage(`Step failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunToEnd = async () => {
    if (!session) return;
    setLoading(true);
    setStatusMessage("Running negotiation to completion across multi-round turns...");

    try {
      let currentSession = session;
      while (currentSession.status === "INITIAL" || currentSession.status === "IN_PROGRESS") {
        const res = await fetch(`/api/negotiations/${currentSession.id}/step`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.session) {
          currentSession = data.session;
          setSession(currentSession);
        } else {
          break;
        }
      }
      if (currentSession.status === "AGREED" || currentSession.status === "AWAITING_HUMAN_APPROVAL") {
        setStatusMessage(`Agreement sealed at $${currentSession.agreedPrice?.toFixed(2)}! Ready for PayPal checkout.`);
      }
    } catch (err: any) {
      setStatusMessage(`Auto-negotiation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isAgreed =
    session && (session.status === "AGREED" || session.status === "AWAITING_HUMAN_APPROVAL");

  const paypalClientId =
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ||
    "BAAO6ku7cEQIAidpJl5I78KmftFTJe6ap18qmig9fLggEBQA_XOjQepzYrSeDiwK8zLrHTDKrcfjA9ZgCo";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-cyan-400" />
            Buyer Agent Portal
          </h1>
          <p className="text-sm text-slate-400">
            Set your purchasing policy bounds. Your autonomous Buyer Agent negotiates on your behalf.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            Policy-Bounded
          </span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            PayPal Orders v2
          </span>
        </div>
      </div>

      {/* Main Grid: Policy Configuration & Negotiation Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product & Policy Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Product Selection Card */}
          <div className="glass-panel rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-cyan-400" />
              Target Product
            </h2>
            <div className="space-y-2">
              <select
                value={selectedProduct.id}
                onChange={(e) => {
                  const p = SEEDED_PRODUCTS.find((item) => item.id === e.target.value);
                  if (p) setSelectedProduct(p);
                }}
                disabled={session?.status === "IN_PROGRESS" || loading}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                {SEEDED_PRODUCTS.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.title} (List: ${prod.listPrice.toFixed(2)})
                  </option>
                ))}
              </select>

              <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5 space-y-1 text-xs">
                <div className="text-slate-400">{selectedProduct.description}</div>
                <div className="flex justify-between pt-2 border-t border-white/5 font-medium">
                  <span className="text-slate-400">Official List Price:</span>
                  <span className="text-white">${selectedProduct.listPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Buyer Policy Bounds Form */}
          <div className="glass-panel rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Human Policy Guardrails
              </h2>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                NON-NEGOTIABLE
              </span>
            </div>

            <div className="space-y-4">
              {/* Max Price Ceiling */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="text-slate-300 font-medium">Maximum Price Ceiling (Hard Cap)</label>
                  <span className="font-bold text-cyan-400">${Number(maxPrice).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={selectedProduct.floorPrice}
                  max={selectedProduct.listPrice}
                  step={1}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  disabled={loading || session?.status === "IN_PROGRESS"}
                  className="w-full accent-cyan-400 bg-slate-800"
                />
                <p className="text-[11px] text-slate-400">Agent will reject any offer exceeding this price ceiling.</p>
              </div>

              {/* Auto Accept Threshold */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="text-slate-300 font-medium">Auto-Accept Below</label>
                  <span className="font-bold text-emerald-400">${Number(autoAcceptBelow).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={maxPrice}
                  step={1}
                  value={autoAcceptBelow}
                  onChange={(e) => setAutoAcceptBelow(Number(e.target.value))}
                  disabled={loading || session?.status === "IN_PROGRESS"}
                  className="w-full accent-emerald-400 bg-slate-800"
                />
                <p className="text-[11px] text-slate-400">Instantly accepts any merchant offer below this target.</p>
              </div>

              {/* Ask Human Threshold */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label className="text-slate-300 font-medium">Ask Human Approval Above</label>
                  <span className="font-bold text-amber-400">${Number(askHumanAbove).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={autoAcceptBelow}
                  max={maxPrice}
                  step={1}
                  value={askHumanAbove}
                  onChange={(e) => setAskHumanAbove(Number(e.target.value))}
                  disabled={loading || session?.status === "IN_PROGRESS"}
                  className="w-full accent-amber-400 bg-slate-800"
                />
                <p className="text-[11px] text-slate-400">Requires explicit human approval click if agreement exceeds this.</p>
              </div>

              {/* No Subscriptions Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium text-slate-300 block">Strictly Prohibit Subscriptions</span>
                  <span className="text-[11px] text-slate-400">Rejects any recurring terms or membership fees</span>
                </div>
                <input
                  type="checkbox"
                  checked={noSubscriptions}
                  onChange={(e) => setNoSubscriptions(e.target.checked)}
                  disabled={loading || session?.status === "IN_PROGRESS"}
                  className="w-4 h-4 rounded text-cyan-500 accent-cyan-500"
                />
              </div>
            </div>

            {/* Launch / Reset Controls */}
            <div className="pt-2">
              {!session ? (
                <button
                  onClick={handleStartNegotiation}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-paypal-blue hover:from-cyan-400 hover:to-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Deploy Buyer Agent & Start</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleStartNegotiation}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Deal</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Transcript & PayPal Checkout (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Transcript Stage */}
          <div className="glass-panel rounded-2xl p-5 flex flex-col h-[560px]">
            {/* Stage Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Live Negotiation Arena
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {session && (
                  <span className="text-xs text-slate-400 font-mono">
                    Round {session.currentRound}/{session.maxRounds} • {session.turns.length} Turns
                  </span>
                )}
                {session && (session.status === "INITIAL" || session.status === "IN_PROGRESS") && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleNextStep}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-500/30 flex items-center gap-1 transition-colors"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>Next Turn</span>
                    </button>
                    <button
                      onClick={handleRunToEnd}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg bg-paypal-blue/30 hover:bg-paypal-blue/40 text-cyan-200 text-xs font-semibold border border-paypal-blue/40 flex items-center gap-1 transition-colors"
                    >
                      <FastForward className="w-3.5 h-3.5" />
                      <span>Auto-Run</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Transcript Messages List */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
              {!session || session.turns.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300">Ready to Negotiate</h3>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      Configure your price ceiling on the left, then click Deploy to initiate round 1 against the Merchant Agent.
                    </p>
                  </div>
                </div>
              ) : (
                session.turns.map((turn, idx) => {
                  const isBuyer = turn.role === "buyer";
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isBuyer ? "items-start" : "items-end"} space-y-1`}
                    >
                      <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                        <span className="font-semibold text-white">
                          {isBuyer ? "🤖 Buyer Agent" : "🏪 Merchant Agent"}
                        </span>
                        <span>• Turn #{turn.turnId}</span>
                        {turn.fallback && (
                          <span className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/20">
                            Deterministic Fallback
                          </span>
                        )}
                        {!turn.fallback && (
                          <span className="text-[10px] bg-cyan-500/10 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-500/20">
                            Gemini 3.5
                          </span>
                        )}
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl p-4 space-y-2 text-xs ${
                          isBuyer
                            ? "bg-slate-800/80 border border-cyan-500/30 text-slate-200"
                            : "bg-gradient-to-br from-slate-900 to-slate-850 border border-amber-500/30 text-slate-200 text-right"
                        }`}
                      >
                        <div
                          className={`flex items-center gap-2 ${
                            isBuyer ? "justify-start" : "justify-end"
                          }`}
                        >
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider ${
                              turn.proposal.action === "accept"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : turn.proposal.action === "reject"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            }`}
                          >
                            {turn.proposal.action}
                          </span>
                          <span className="text-sm font-extrabold text-white">
                            ${turn.proposal.price.toFixed(2)}
                          </span>
                        </div>

                        <p className="text-slate-300 leading-relaxed">{turn.proposal.rationale}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Status Footer */}
            {statusMessage && (
              <div className="pt-3 border-t border-white/5 text-xs text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  {statusMessage}
                </span>
                {loading && <span className="animate-spin text-cyan-400 font-mono">◓</span>}
              </div>
            )}
          </div>

          {/* Settlement / PayPal Approval Gate */}
          {isAgreed && (
            <div className="glass-panel-glow rounded-2xl p-6 space-y-5 border-emerald-500/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-lg font-bold text-white">Mutual Agreement Reached!</h3>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Both agents settled within policy bounds. Authorize PayPal payment to capture the order.
                  </p>
                </div>

                <div className="text-right self-start sm:self-auto bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                  <span className="text-[10px] text-emerald-300 uppercase block font-semibold">Agreed Settlement</span>
                  <span className="text-2xl font-black text-white">${session?.agreedPrice?.toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 block line-through">
                    List: ${session?.product.listPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              {!orderCaptured ? (
                <div className="space-y-4">
                  <div className="bg-slate-900/80 rounded-xl p-3.5 border border-white/10 text-xs text-slate-300 flex items-center gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
                    <span>
                      Human-in-the-loop gate: PayPal Sandbox checkout requires your authorization to finalize settlement.
                    </span>
                  </div>

                  {/* PayPal Buttons Integration */}
                  <div className="max-w-md mx-auto pt-2">
                    <PayPalScriptProvider
                      options={{
                        clientId: paypalClientId,
                        currency: "USD",
                        intent: "capture",
                      }}
                    >
                      <PayPalButtons
                        style={{ layout: "vertical", shape: "rect", color: "gold" }}
                        createOrder={async () => {
                          const res = await fetch("/api/orders/create", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sessionId: session.id }),
                          });
                          const data = await res.json();
                          if (!data.orderId) throw new Error(data.error || "Order creation failed");
                          return data.orderId;
                        }}
                        onApprove={async (data) => {
                          const res = await fetch("/api/orders/capture", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              sessionId: session.id,
                              orderId: data.orderID,
                            }),
                          });
                          const result = await res.json();
                          if (result.success) {
                            setOrderCaptured(true);
                            setCaptureDetails({
                              orderId: data.orderID,
                              captureId: result.captureId,
                            });
                          }
                        }}
                      />
                    </PayPalScriptProvider>
                  </div>
                </div>
              ) : (
                /* Payment Success Receipt */
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">Payment Captured Successfully!</h4>
                      <p className="text-xs text-emerald-300 font-mono">
                        PayPal Orders v2 Capture Status: COMPLETED
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-900/60 p-3 rounded-lg border border-white/5 text-xs font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px]">PAYPAL ORDER ID:</span>
                      <span className="text-white font-bold">{captureDetails?.orderId}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">PAYPAL CAPTURE ID:</span>
                      <span className="text-cyan-400 font-bold">{captureDetails?.captureId}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <a
                      href="/merchant"
                      className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold text-center transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Scale className="w-4 h-4" />
                      <span>Switch to Merchant Portal (View Dispute & Refund)</span>
                    </a>
                    <a
                      href="/admin"
                      className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold text-center transition-colors"
                    >
                      View in AG Grid Audit
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
