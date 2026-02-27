"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminLogoutButton } from "@/components/AdminLogoutButton";
import { Card } from "@/components/ui";
import { formatKgs } from "@/lib/money";

type DailyRow = {
  date: string;
  orders: number;
  delivered: number;
  canceled: number;
  revenueKgs: number;
  avgCheckKgs: number;
};

type ReportResp = {
  summary: {
    totalRevenueKgs: number;
    totalOrders: number;
    totalDelivered: number;
    totalCanceled: number;
    avgCheckKgs: number;
  };
  daily: DailyRow[];
  topItems: Array<{ title: string; qty: number; revenueKgs: number }>;
};

type AuditRow = {
  id: string;
  action: string;
  actor: string;
  actorRole: string;
  createdAt: string;
  orderId?: string | null;
};

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-black/55">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
    </Card>
  );
}

function RevenueChart({ rows }: { rows: DailyRow[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(rows.length > 0 ? rows.length - 1 : 0);
  }, [rows.length]);

  const maxRevenue = useMemo(() => Math.max(1, ...rows.map((row) => row.revenueKgs)), [rows]);
  const maxOrders = useMemo(() => Math.max(1, ...rows.map((row) => row.orders)), [rows]);

  const chart = useMemo(() => {
    const width = 760;
    const height = 260;
    const paddingX = 28;
    const paddingTop = 14;
    const paddingBottom = 34;
    const innerW = width - paddingX * 2;
    const innerH = height - paddingTop - paddingBottom;

    const denominator = Math.max(1, rows.length - 1);
    const points = rows.map((row, idx) => {
      const x = paddingX + (innerW * idx) / denominator;
      const y = paddingTop + innerH - (row.revenueKgs / maxRevenue) * innerH;
      const barH = (row.orders / maxOrders) * innerH;
      return {
        ...row,
        x,
        y,
        barY: paddingTop + innerH - barH,
        barH
      };
    });

    let linePath = "";
    let areaPath = "";
    if (points.length > 0) {
      linePath = points
        .map((point, idx) => `${idx === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(" ");

      const first = points[0];
      const last = points[points.length - 1];
      areaPath = `${linePath} L ${last.x.toFixed(1)} ${(paddingTop + innerH).toFixed(1)} L ${first.x.toFixed(1)} ${(paddingTop + innerH).toFixed(1)} Z`;
    }

    return {
      width,
      height,
      paddingX,
      paddingTop,
      paddingBottom,
      innerH,
      points,
      linePath,
      areaPath
    };
  }, [rows, maxRevenue, maxOrders]);

  const active = chart.points[Math.min(activeIndex, Math.max(0, chart.points.length - 1))] ?? null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">Выручка по дням</div>
      <div className="px-4 pb-4 pt-3">
        {rows.length === 0 ? (
          <div className="text-sm text-black/50">Нет данных за выбранный период.</div>
        ) : (
          <>
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-56 w-full overflow-visible">
              {[0, 1, 2, 3, 4].map((step) => {
                const y = chart.paddingTop + (chart.innerH * step) / 4;
                return <line key={step} x1={chart.paddingX} x2={chart.width - chart.paddingX} y1={y} y2={y} stroke="rgba(15,23,42,0.08)" strokeDasharray="4 6" />;
              })}

              {chart.points.map((point, idx) => {
                const next = chart.points[idx + 1];
                const barWidth = next ? Math.max(8, next.x - point.x - 8) : 12;
                return (
                  <rect
                    key={`bar-${point.date}`}
                    x={point.x - barWidth / 2}
                    y={point.barY}
                    width={barWidth}
                    height={point.barH}
                    rx={6}
                    fill={idx === activeIndex ? "rgba(14,165,233,0.25)" : "rgba(15,23,42,0.08)"}
                  />
                );
              })}

              {chart.areaPath ? <path d={chart.areaPath} fill="rgba(6,182,212,0.18)" /> : null}
              {chart.linePath ? <path d={chart.linePath} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" /> : null}

              {chart.points.map((point, idx) => (
                <g key={`point-${point.date}`} onMouseEnter={() => setActiveIndex(idx)} onFocus={() => setActiveIndex(idx)}>
                  <circle cx={point.x} cy={point.y} r={idx === activeIndex ? 6.5 : 4.5} fill={idx === activeIndex ? "#0284c7" : "#111827"} />
                </g>
              ))}
            </svg>

            {active ? (
              <div className="mt-2 rounded-2xl border border-black/10 bg-white/80 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{active.date}</div>
                  <div className="font-bold">{formatKgs(active.revenueKgs)}</div>
                </div>
                <div className="mt-1 text-xs text-black/60">
                  Заказы: {active.orders} · Доставлено: {active.delivered} · Отменено: {active.canceled} · Средний чек: {formatKgs(active.avgCheckKgs)}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function TopItemsChart({ items }: { items: Array<{ title: string; qty: number; revenueKgs: number }> }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  const maxQty = useMemo(() => Math.max(1, ...items.map((item) => item.qty)), [items]);
  const active = items[Math.min(activeIndex, Math.max(0, items.length - 1))] ?? null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">Топ блюд</div>
      <div className="px-4 pb-4 pt-3">
        {items.length === 0 ? (
          <div className="text-sm text-black/50">Пока нет доставленных заказов.</div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const width = Math.max(8, Math.round((item.qty / maxQty) * 100));
              const isActive = idx === activeIndex;
              return (
                <button
                  key={item.title}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onFocus={() => setActiveIndex(idx)}
                  onClick={() => setActiveIndex(idx)}
                  className={`relative w-full overflow-hidden rounded-2xl border px-3 py-2 text-left text-sm transition ${
                    isActive ? "border-cyan-300 bg-cyan-50/70" : "border-black/10 bg-white/80"
                  }`}
                >
                  <div className="absolute inset-y-0 left-0 bg-cyan-300/35" style={{ width: `${width}%` }} />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 truncate font-semibold">{item.title}</div>
                    <div className="shrink-0 text-xs font-semibold text-black/70">{item.qty} шт.</div>
                  </div>
                </button>
              );
            })}

            {active ? (
              <div className="mt-2 rounded-2xl border border-black/10 bg-white/80 p-3 text-sm">
                <div className="font-semibold">{active.title}</div>
                <div className="mt-1 text-xs text-black/60">Количество: {active.qty} · Выручка: {formatKgs(active.revenueKgs)}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AdminReportsPage() {
  const [days, setDays] = useState(14);
  const [report, setReport] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const [reportRes, auditRes] = await Promise.all([
          fetch(`/api/admin/reports/daily?days=${days}`, { cache: "no-store" }),
          fetch("/api/admin/audit?limit=40", { cache: "no-store" })
        ]);

        if (mounted && reportRes.ok) {
          const j = (await reportRes.json()) as ReportResp;
          setReport(j);
        }

        if (mounted && auditRes.ok) {
          const a = (await auditRes.json()) as { logs?: AuditRow[] };
          setAudit(a.logs ?? []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [days]);

  const summary = report?.summary;
  const daily = report?.daily ?? [];
  const topItems = report?.topItems ?? [];

  const conversion = useMemo(() => {
    if (!summary || summary.totalOrders === 0) return 0;
    return Math.round((summary.totalDelivered / summary.totalOrders) * 100);
  }, [summary]);

  return (
    <main className="min-h-screen p-5">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-black/50">Админка</div>
            <div className="text-3xl font-extrabold">Отчеты</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="text-sm text-black/60 underline" href="/admin">
              Назад
            </Link>
            <AdminLogoutButton className="px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-4 inline-flex gap-2 rounded-2xl border border-black/10 bg-white p-1">
          {[7, 14, 30].map((value) => (
            <button
              key={value}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${days === value ? "bg-black text-white" : "text-black/70"}`}
              onClick={() => setDays(value)}
            >
              {value} дней
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <KpiCard label="Выручка" value={formatKgs(summary?.totalRevenueKgs ?? 0)} />
          <KpiCard label="Заказы" value={summary?.totalOrders ?? 0} />
          <KpiCard label="Средний чек" value={formatKgs(summary?.avgCheckKgs ?? 0)} />
          <KpiCard label="Доставлено / Конверсия" value={`${summary?.totalDelivered ?? 0} / ${conversion}%`} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <RevenueChart rows={daily} />
          <TopItemsChart items={topItems} />
        </div>

        <Card className="mt-5 overflow-hidden p-0">
          <div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">Журнал действий админа</div>
          <div className="max-h-80 overflow-auto px-4 py-3">
            <div className="space-y-2">
              {audit.map((row) => (
                <div key={row.id} className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{row.action}</div>
                    <div className="text-xs text-black/55">{new Date(row.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-xs text-black/60">
                    {row.actor} · {row.actorRole}
                    {row.orderId ? ` · Заказ #${row.orderId.slice(-6)}` : ""}
                  </div>
                </div>
              ))}
              {!loading && audit.length === 0 && <div className="text-sm text-black/50">Журнал пока пуст.</div>}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}