"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  CommunityFeaturesModule,
  CsvExportModule,
  ClientSideRowModelModule,
  ColDef,
  GridApi,
} from "ag-grid-community";
import {
  LayoutDashboard,
  ShieldCheck,
  RotateCcw,
  Download,
  Search,
  CheckCircle2,
  AlertOctagon,
  FileSpreadsheet,
} from "lucide-react";

// Register AG Grid Community modules
ModuleRegistry.registerModules([CommunityFeaturesModule, CsvExportModule, ClientSideRowModelModule]);

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<"audit" | "negotiations" | "orders">("audit");
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [integrity, setIntegrity] = useState<{ valid: boolean; error?: string }>({ valid: true });
  const [loading, setLoading] = useState<boolean>(true);
  const [quickFilterText, setQuickFilterText] = useState<string>("");

  const gridApiRef = useRef<GridApi | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [auditRes, negRes] = await Promise.all([
        fetch("/api/audit"),
        fetch("/api/negotiations"),
      ]);

      const auditData = await auditRes.json();
      const negData = await negRes.json();

      if (auditData.entries) {
        setAuditEntries(auditData.entries);
        setIntegrity(auditData.integrity || { valid: true });
      }

      if (negData.sessions) {
        setSessions(negData.sessions);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Column definitions for Audit Ledger
  const auditColDefs = useMemo<ColDef[]>(
    () => [
      { field: "id", headerName: "#", width: 70, sortable: true, filter: "agNumberColumnFilter" },
      {
        field: "timestamp",
        headerName: "Timestamp",
        width: 190,
        sortable: true,
        filter: "agDateColumnFilter",
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString() : ""),
      },
      {
        field: "actor",
        headerName: "Actor",
        width: 140,
        sortable: true,
        filter: true,
        cellRenderer: (p: any) => {
          const val = p.value;
          let color = "bg-slate-700 text-slate-200";
          if (val === "buyer_agent") color = "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
          if (val === "seller_agent") color = "bg-amber-500/20 text-amber-300 border border-amber-500/30";
          if (val === "policy_engine") color = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
          if (val === "mediator_agent") color = "bg-purple-500/20 text-purple-300 border border-purple-500/30";
          if (val === "paypal_api") color = "bg-blue-600/20 text-blue-300 border border-blue-500/30";

          return (
            <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${color}`}>
              {val}
            </span>
          );
        },
      },
      {
        field: "type",
        headerName: "Event Type",
        width: 220,
        sortable: true,
        filter: true,
        cellClass: "font-mono text-[11px] font-semibold text-white",
      },
      {
        field: "payload",
        headerName: "Payload Details",
        flex: 2,
        valueGetter: (p) => JSON.stringify(p.data?.payload || {}),
        cellClass: "font-mono text-[11px] text-slate-400",
      },
      {
        field: "prev_hash",
        headerName: "Previous Hash (SHA-256)",
        width: 160,
        valueFormatter: (p) => (p.value ? `${p.value.substring(0, 14)}...` : ""),
        cellClass: "font-mono text-[11px] text-slate-500",
      },
      {
        field: "hash",
        headerName: "Block Hash",
        width: 160,
        valueFormatter: (p) => (p.value ? `${p.value.substring(0, 14)}...` : ""),
        cellClass: "font-mono text-[11px] text-cyan-400",
      },
    ],
    []
  );

  // Column definitions for Negotiations
  const negotiationColDefs = useMemo<ColDef[]>(
    () => [
      { field: "id", headerName: "Session ID", width: 180, cellClass: "font-mono text-xs text-slate-400", filter: true },
      { field: "product.title", headerName: "Item", flex: 1, sortable: true, filter: true },
      {
        field: "product.listPrice",
        headerName: "List Price",
        width: 110,
        valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`,
      },
      {
        field: "buyerPolicy.max_price",
        headerName: "Buyer Ceiling",
        width: 130,
        valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`,
      },
      {
        field: "agreedPrice",
        headerName: "Agreed Price",
        width: 130,
        cellRenderer: (p: any) =>
          p.value ? (
            <strong className="text-emerald-400 font-bold">${Number(p.value).toFixed(2)}</strong>
          ) : (
            <span className="text-slate-500">None</span>
          ),
      },
      {
        field: "status",
        headerName: "Status",
        width: 160,
        sortable: true,
        filter: true,
        cellRenderer: (p: any) => {
          const val = p.value;
          let color = "bg-slate-700 text-slate-300";
          if (val === "AGREED") color = "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
          if (val === "COMPLETED") color = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
          if (val === "IN_PROGRESS") color = "bg-amber-500/20 text-amber-300 border border-amber-500/30";
          return (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${color}`}>
              {val}
            </span>
          );
        },
      },
      {
        field: "paypalOrderId",
        headerName: "PayPal Order ID",
        width: 200,
        cellClass: "font-mono text-xs text-cyan-300",
        valueFormatter: (p) => p.value || "—",
      },
    ],
    []
  );

  const handleExportCsv = () => {
    if (gridApiRef.current) {
      gridApiRef.current.exportDataAsCsv({
        fileName: `orderly_ai_${activeTab}_export.csv`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-emerald-400" />
            AG Grid Real-Time Audit Dashboard
          </h1>
          <p className="text-sm text-slate-400">
            Powered by AG Grid Community & SHA-256 cryptographic prev_hash chaining for tamper-evident ledger tracking.
          </p>
        </div>

        {/* Cryptographic Proof Status */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {integrity.valid ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-xl border border-emerald-500/30 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>SHA-256 Ledger: VERIFIED UNTAMPERED</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-500/10 text-rose-300 px-3 py-1.5 rounded-xl border border-rose-500/30 text-xs font-semibold">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>TAMPER DETECTED: {integrity.error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Bar: Tabs, Search & CSV Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-white/10">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "audit"
                ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            Audit Trail ({auditEntries.length})
          </button>
          <button
            onClick={() => setActiveTab("negotiations")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "negotiations"
                ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                : "text-slate-300 hover:text-white hover:bg-white/5"
            }`}
          >
            Negotiations ({sessions.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Filter Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search all columns..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48 sm:w-64"
            />
          </div>

          <button
            onClick={fetchData}
            title="Refresh Grid"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* AG Grid Container */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="ag-theme-quartz-dark" style={{ height: 600, width: "100%" }}>
          <AgGridReact
            rowData={activeTab === "audit" ? auditEntries : sessions}
            columnDefs={activeTab === "audit" ? auditColDefs : negotiationColDefs}
            quickFilterText={quickFilterText}
            pagination={true}
            paginationPageSize={20}
            animateRows={true}
            onGridReady={(params) => {
              gridApiRef.current = params.api;
            }}
          />
        </div>
      </div>
    </div>
  );
}
