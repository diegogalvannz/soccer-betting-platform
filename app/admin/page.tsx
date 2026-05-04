"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";
import {
  Users, Target, TrendingUp, DollarSign, Activity, AlertTriangle,
  Shield, BarChart3, Settings, LogOut, RefreshCw, Zap, Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "overview" | "picks" | "users" | "apis" | "logs" | "monetization";

type OverviewData = {
  totalUsers: number; activeUsers: number; totalPicks: number;
  wonPicks: number; lostPicks: number; pendingPicks: number;
  winRate: number; totalBets: number; totalProfit: number;
  totalStaked: number; roi: number;
};

type PicksData = {
  byDay: Array<{ date: string; total: number; won: number; lost: number }>;
  byLeague: Array<{ league: string; won: number; total: number; winRate: number }>;
  byMarket: Array<{ market: string; won: number; total: number; winRate: number }>;
  byConfidence: Array<{ bucket: string; won: number; total: number; winRate: number }>;
};

type UsersData = {
  userList: Array<{ id: string; email: string; joinedAt: string; totalBets: number; roi: number; retained: boolean }>;
  signupsByDay: Array<{ date: string; signups: number }>;
  retentionRate: number;
};

type ApiData = {
  rapidApi: { used: number; limit: number };
  fdApi: { used: number; limit: number };
  lastCronRuns: Array<{ type: string; message: string; createdAt: string }>;
  errorsLast24h: number;
  recentActivity: Array<{ type: string; message: string; createdAt: string }>;
};

type LogsData = {
  logs: Array<{ id: string; type: string; message: string; createdAt: string; meta: unknown }>;
};

// ─── Auth gate ────────────────────────────────────────────────────────────────

function AuthGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/admin-data?section=overview&password=${encodeURIComponent(pw)}`);
    if (res.ok) { onAuth(pw); }
    else { setErr(true); setTimeout(() => setErr(false), 2000); }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-sm p-8 bg-[#1a1a1a] border border-white/8 rounded-3xl space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">⚽</div>
          <h1 className="text-xl font-bold text-white">Soccer Intel</h1>
          <p className="text-sm text-gray-400">Panel de Administración</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            placeholder="Contraseña de administrador"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl bg-white/5 border text-white text-sm placeholder:text-gray-500 outline-none transition-colors ${
              err ? "border-red-500" : "border-white/10 focus:border-[#00ff88]/50"
            }`}
          />
          {err && <p className="text-xs text-red-400 text-center">Contraseña incorrecta</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#00ff88] text-black font-bold text-sm hover:bg-[#00e87a] transition-colors"
          >
            Entrar al panel
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Admin App ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  const fetchSection = useCallback(async (sec: Section, pw: string, logType?: string) => {
    setLoading(true);
    try {
      const url = `/api/admin-data?section=${sec}&password=${encodeURIComponent(pw)}${logType ? `&type=${logType}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      setData((prev) => ({ ...prev, [sec]: json }));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const handleAuth = (pw: string) => {
    setPassword(pw);
    fetchSection("overview", pw);
  };

  useEffect(() => {
    if (password && section !== "monetization") fetchSection(section, password);
  }, [section, password, fetchSection]);

  if (!password) return <AuthGate onAuth={handleAuth} />;

  const navItems: Array<{ key: Section; label: string; icon: React.ReactNode }> = [
    { key: "overview",     label: "Resumen",       icon: <Activity className="h-4 w-4" /> },
    { key: "picks",        label: "Pronósticos",   icon: <Target className="h-4 w-4" /> },
    { key: "users",        label: "Usuarios",      icon: <Users className="h-4 w-4" /> },
    { key: "apis",         label: "APIs",          icon: <Globe className="h-4 w-4" /> },
    { key: "logs",         label: "Logs",          icon: <BarChart3 className="h-4 w-4" /> },
    { key: "monetization", label: "Monetización",  icon: <DollarSign className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/8 flex flex-col bg-[#0f0f0f]">
        <div className="p-5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <div>
              <p className="font-bold text-xs text-white leading-none">Soccer Intel</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Admin CEO</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                section === item.key
                  ? "bg-[#00ff88]/15 text-[#00ff88]"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/8 space-y-1">
          <button
            onClick={() => password && fetchSection(section, password)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
          <button
            onClick={() => setPassword(null)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl">
          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
              <div className="h-4 w-4 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin" />
              Cargando datos...
            </div>
          )}

          {section === "overview"     && <OverviewSection data={data.overview as OverviewData} />}
          {section === "picks"        && <PicksSection data={data.picks as PicksData} />}
          {section === "users"        && <UsersSection data={data.users as UsersData} />}
          {section === "apis"         && <ApisSection data={data.apis as ApiData} />}
          {section === "logs"         && <LogsSection data={data.logs as LogsData} password={password} fetchSection={fetchSection} />}
          {section === "monetization" && <MonetizationSection totalUsers={(data.overview as OverviewData)?.totalUsers ?? 0} />}
        </div>
      </main>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, positive, negative, icon }: {
  label: string; value: string | number; sub?: string;
  positive?: boolean; negative?: boolean; icon?: React.ReactNode;
}) {
  const valCls = positive ? "text-[#00ff88]" : negative ? "text-red-400" : "text-white";
  return (
    <div className="bg-[#1a1a1a] border border-white/8 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-400">{label}</p>
        {icon && <span className="text-gray-500">{icon}</span>}
      </div>
      <p className={`text-3xl font-black tabular-nums ${valCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Section 1: Overview ──────────────────────────────────────────────────────

function OverviewSection({ data }: { data: OverviewData | undefined }) {
  if (!data) return <SectionSkeleton />;
  const profitDisplay = data.totalProfit >= 0 ? `+$${data.totalProfit.toFixed(2)}` : `-$${Math.abs(data.totalProfit).toFixed(2)}`;
  return (
    <div className="space-y-6">
      <SectionTitle title="Resumen General" sub="KPIs globales de la plataforma" icon={<Activity />} />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPI label="Usuarios Registrados" value={data.totalUsers} icon={<Users className="h-4 w-4" />} />
        <KPI label="Usuarios Activos (7d)" value={data.activeUsers} positive={data.activeUsers > 0} icon={<Zap className="h-4 w-4" />} />
        <KPI label="Total Pronósticos" value={data.totalPicks} icon={<Target className="h-4 w-4" />} />
        <KPI
          label="Win Rate Global"
          value={`${data.winRate}%`}
          sub={`${data.wonPicks}G · ${data.lostPicks}P · ${data.pendingPicks} pend.`}
          positive={data.winRate >= 55}
          negative={data.winRate > 0 && data.winRate < 45}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KPI label="Total Apuestas" value={data.totalBets} icon={<BarChart3 className="h-4 w-4" />} />
        <KPI
          label="Ganancia Total Usuarios"
          value={data.totalBets > 0 ? profitDisplay : "—"}
          sub={data.totalBets > 0 ? `ROI: ${data.roi > 0 ? "+" : ""}${data.roi}%` : "Sin apuestas registradas"}
          positive={data.totalProfit > 0}
          negative={data.totalProfit < 0}
          icon={<DollarSign className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

// ─── Section 2: Picks performance ─────────────────────────────────────────────

function PicksSection({ data }: { data: PicksData | undefined }) {
  if (!data) return <SectionSkeleton />;

  const dayData = data.byDay.filter((d) => d.total > 0);

  return (
    <div className="space-y-6">
      <SectionTitle title="Rendimiento de Pronósticos" sub="Últimos 30 días" icon={<Target />} />

      {/* Picks per day */}
      <AdminCard title="Pronósticos por día">
        {dayData.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin datos recientes</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
              <Bar dataKey="won" name="Ganados" fill="#00ff88" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="lost" name="Perdidos" fill="#ff4444" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </AdminCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By league */}
        <AdminCard title="Win Rate por Liga">
          <div className="space-y-3">
            {data.byLeague.map((l) => (
              <div key={l.league}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 truncate">{l.league}</span>
                  <span className={`font-mono font-bold ml-2 shrink-0 ${l.winRate >= 55 ? "text-[#00ff88]" : l.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                    {l.winRate}% ({l.won}/{l.total})
                  </span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${l.winRate >= 55 ? "bg-[#00ff88]" : l.winRate >= 45 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${l.winRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AdminCard>

        {/* By market */}
        <AdminCard title="Win Rate por Mercado">
          <div className="space-y-3">
            {data.byMarket.map((m) => (
              <div key={m.market}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{m.market}</span>
                  <span className={`font-mono font-bold ml-2 ${m.winRate >= 55 ? "text-[#00ff88]" : m.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                    {m.winRate}% ({m.won}/{m.total})
                  </span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${m.winRate >= 55 ? "bg-[#00ff88]" : m.winRate >= 45 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${m.winRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      {/* By confidence */}
      <AdminCard title="Accuracy por Nivel de Confianza">
        <div className="grid grid-cols-3 gap-4">
          {data.byConfidence.map((c) => (
            <div key={c.bucket} className="text-center bg-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Confianza {c.bucket}</p>
              <p className={`text-2xl font-black tabular-nums ${c.winRate >= 55 ? "text-[#00ff88]" : c.winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                {c.total > 0 ? `${c.winRate}%` : "—"}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">{c.won}/{c.total} picks</p>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}

// ─── Section 3: Users ─────────────────────────────────────────────────────────

function UsersSection({ data }: { data: UsersData | undefined }) {
  if (!data) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      <SectionTitle title="Actividad de Usuarios" sub="Últimas 4 semanas" icon={<Users />} />

      <div className="grid grid-cols-2 gap-4">
        <KPI label="Total Usuarios" value={data.userList.length} icon={<Users className="h-4 w-4" />} />
        <KPI label="Tasa de Retención" value={`${data.retentionRate}%`} positive={data.retentionRate >= 50} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Signups chart */}
      <AdminCard title="Nuevos registros por día">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data.signupsByDay}>
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#fff" }} />
            <Line type="monotone" dataKey="signups" stroke="#00ff88" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </AdminCard>

      {/* User table */}
      <AdminCard title={`Lista de Usuarios (${data.userList.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {["Email", "Registro", "Apuestas", "ROI", "Retención"].map((h) => (
                  <th key={h} className="py-2 pr-4 text-left text-xs font-medium text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.userList.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/3">
                  <td className="py-2.5 pr-4 text-gray-200 font-mono text-xs">{u.email}</td>
                  <td className="py-2.5 pr-4 text-gray-400 text-xs">{new Date(u.joinedAt).toLocaleDateString("es-MX")}</td>
                  <td className="py-2.5 pr-4 text-gray-200">{u.totalBets}</td>
                  <td className={`py-2.5 pr-4 font-mono font-bold ${u.roi >= 0 ? "text-[#00ff88]" : "text-red-400"}`}>
                    {u.totalBets > 0 ? `${u.roi >= 0 ? "+" : ""}${u.roi}%` : "—"}
                  </td>
                  <td className="py-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${u.retained ? "text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/10" : "text-gray-500 border-white/10"}`}>
                      {u.retained ? "Activo" : "No retuvo"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}

// ─── Section 4: APIs ──────────────────────────────────────────────────────────

function ApisSection({ data }: { data: ApiData | undefined }) {
  if (!data) return <SectionSkeleton />;

  const rapidPct = Math.round((data.rapidApi.used / data.rapidApi.limit) * 100);
  const fdPct = Math.round((data.fdApi.used / data.fdApi.limit) * 100);

  return (
    <div className="space-y-6">
      <SectionTitle title="Monitor de APIs" sub="Estado de las integraciones externas" icon={<Globe />} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RapidAPI */}
        <AdminCard title="RapidAPI — Live Football">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Llamadas este mes</span>
              <span className={`font-bold font-mono ${rapidPct >= 90 ? "text-red-400" : rapidPct >= 70 ? "text-yellow-400" : "text-[#00ff88]"}`}>
                {data.rapidApi.used}/{data.rapidApi.limit}
              </span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${rapidPct >= 90 ? "bg-red-500" : rapidPct >= 70 ? "bg-yellow-400" : "bg-[#00ff88]"}`}
                style={{ width: `${rapidPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {100 - data.rapidApi.used} llamadas restantes este mes
              {rapidPct >= 80 && " ⚠️ Presupuesto casi agotado"}
            </p>
          </div>
        </AdminCard>

        {/* Football-Data.org */}
        <AdminCard title="Football-Data.org">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Llamadas hoy</span>
              <span className={`font-bold font-mono ${fdPct >= 90 ? "text-red-400" : fdPct >= 70 ? "text-yellow-400" : "text-[#00ff88]"}`}>
                {data.fdApi.used}/{data.fdApi.limit}
              </span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fdPct >= 90 ? "bg-red-500" : fdPct >= 70 ? "bg-yellow-400" : "bg-[#00ff88]"}`}
                style={{ width: `${Math.min(fdPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{600 - data.fdApi.used} llamadas restantes hoy</p>
          </div>
        </AdminCard>
      </div>

      {/* Errors + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdminCard title="Errores últimas 24h">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-8 w-8 ${data.errorsLast24h > 0 ? "text-red-400" : "text-[#00ff88]"}`} />
            <div>
              <p className={`text-3xl font-black ${data.errorsLast24h > 0 ? "text-red-400" : "text-[#00ff88]"}`}>
                {data.errorsLast24h}
              </p>
              <p className="text-xs text-gray-500">error{data.errorsLast24h !== 1 ? "es" : ""} registrado{data.errorsLast24h !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </AdminCard>

        <AdminCard title="Última ejecución de crons">
          <div className="space-y-2">
            {data.lastCronRuns.length === 0 ? (
              <p className="text-gray-500 text-xs">Sin crons ejecutados recientemente</p>
            ) : (
              data.lastCronRuns.slice(0, 4).map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <span className="text-[10px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded font-mono shrink-0">{l.type}</span>
                  <span className="text-[10px] text-gray-400 truncate flex-1">{l.message.slice(0, 50)}</span>
                  <span className="text-[10px] text-gray-600 shrink-0">{new Date(l.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

// ─── Section 5: Logs ──────────────────────────────────────────────────────────

function LogsSection({ data, password, fetchSection }: {
  data: LogsData | undefined;
  password: string;
  fetchSection: (sec: Section, pw: string, type?: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const logTypes = ["all", "ERROR", "INFO", "CRON", "SETTLE", "INGEST", "GENERATE", "LEARNING"];

  return (
    <div className="space-y-6">
      <SectionTitle title="Logs del Sistema" sub="Últimas 50 entradas" icon={<BarChart3 />} />

      <div className="flex flex-wrap gap-2">
        {logTypes.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTypeFilter(t);
              fetchSection("logs", password, t === "all" ? undefined : t);
            }}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
              typeFilter === t
                ? "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!data ? (
        <SectionSkeleton />
      ) : (
        <div className="space-y-2">
          {data.logs.map((log) => (
            <div
              key={log.id}
              className={`p-3 rounded-xl border text-xs ${
                log.type === "ERROR"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-white/8 bg-[#1a1a1a]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                  log.type === "ERROR" ? "text-red-400 bg-red-500/20" :
                  log.type === "SETTLE" ? "text-[#00ff88] bg-[#00ff88]/10" :
                  "text-gray-400 bg-white/5"
                }`}>{log.type}</span>
                <span className="text-gray-500">{new Date(log.createdAt).toLocaleString("es-MX")}</span>
              </div>
              <p className="text-gray-300 leading-relaxed">{log.message}</p>
            </div>
          ))}
          {data.logs.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">Sin logs para este filtro</p>}
        </div>
      )}
    </div>
  );
}

// ─── Section 6: Monetization ──────────────────────────────────────────────────

function MonetizationSection({ totalUsers }: { totalUsers: number }) {
  const projections = [
    { pct: 5,  users: Math.round(totalUsers * 0.05) },
    { pct: 10, users: Math.round(totalUsers * 0.10) },
    { pct: 20, users: Math.round(totalUsers * 0.20) },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title="Monetización — Plan Premium" sub="Preparado para activar con Stripe" icon={<DollarSign />} />

      <div className="grid grid-cols-2 gap-4">
        <KPI label="Usuarios Premium Activos" value="0" sub="Plan premium no activo aún" />
        <KPI label="Precio Sugerido" value="$9.99" sub="por mes" positive />
      </div>

      <AdminCard title="Proyección de Ingresos">
        <div className="space-y-3">
          {projections.map((p) => (
            <div key={p.pct} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-gray-300">{p.pct}% de conversión ({p.users} usuarios)</span>
              <span className="font-bold font-mono text-[#00ff88]">
                ${(p.users * 9.99).toFixed(0)}/mes
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">Con {totalUsers} usuarios registrados</p>
      </AdminCard>

      <div className="grid grid-cols-2 gap-4">
        <button
          disabled
          className="p-4 rounded-2xl border border-dashed border-white/15 text-gray-500 text-sm font-medium flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
        >
          <Settings className="h-4 w-4" />
          Configurar Stripe
        </button>
        <button
          disabled
          className="p-4 rounded-2xl border border-dashed border-white/15 text-gray-500 text-sm font-medium flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
        >
          <Shield className="h-4 w-4" />
          Activar Paywall
        </button>
      </div>

      <div className="p-4 rounded-2xl border border-[#00ff88]/20 bg-[#00ff88]/5 text-sm text-[#00ff88]/80">
        <p className="font-medium mb-1">Cómo activar</p>
        <ol className="space-y-1 text-xs text-[#00ff88]/60 list-decimal list-inside">
          <li>Crear cuenta en Stripe Dashboard</li>
          <li>Agregar STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET a variables de entorno en Vercel</li>
          <li>Crear producto "Soccer Intel Premium" en Stripe ($9.99/mes)</li>
          <li>Reactivar el botón "Configurar Stripe" en esta sección</li>
          <li>Agregar middleware de autenticación premium a las rutas de picks</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function SectionTitle({ title, sub, icon }: { title: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-[#00ff88]">{icon}</span>
      <div>
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
    </div>
  );
}

function AdminCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-white/8 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-200 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-48 bg-white/5 rounded-lg" />
      <div className="grid grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-2xl" />)}
      </div>
    </div>
  );
}
