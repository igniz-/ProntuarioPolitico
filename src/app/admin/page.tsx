"use client";

import { FormEvent, useEffect, useState } from "react";

type Metrics = {
  totals: { sessions: number; unique_visitors: number; average_duration: number };
  shares: number;
  recent: Array<{ day: string; visits: number; unique_visitors: number }>;
  paths: Array<{ path: string; views: number }>;
  reports: Array<{ id: string; profile_name: string; issue: string; source_url: string; status: string; moderation_status: string; moderation_confidence: string; moderation_reason: string; proposed_correction?: string; created_at: string }>;
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resolvingReport, setResolvingReport] = useState<string | null>(null);

  async function loadMetrics() {
    const response = await fetch("/api/admin/metrics");
    if (!response.ok) throw new Error("No se pudo cargar el panel.");
    setMetrics(await response.json() as Metrics);
  }

  useEffect(() => { void loadMetrics().catch(() => undefined); }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error((await response.json()).error || "Token inválido.");
      setToken(""); await loadMetrics();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo iniciar sesión."); }
    finally { setLoading(false); }
  }

  async function decideReport(id: string, status: "approved" | "rejected") {
    setError(""); setResolvingReport(id);
    try {
      const response = await fetch("/api/admin/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (!response.ok) { setError("No se pudo actualizar el reporte."); return; }
      await loadMetrics();
    } finally { setResolvingReport(null); }
  }

  if (!metrics) return <main className="admin-shell"><div className="admin-login"><span className="eyebrow">PRONTUARIO POLITICO</span><h1>Panel de administración</h1><p>Acceso privado para métricas y moderación.</p><form onSubmit={signIn}><label>Token administrativo<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="current-password" required /></label><button type="submit" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button></form>{error && <p className="admin-error">{error}</p>}</div></main>;

  const averageMinutes = Math.floor(Number(metrics.totals.average_duration ?? 0) / 60);
  const averageSeconds = Math.round(Number(metrics.totals.average_duration ?? 0) % 60);
  return <main className="admin-shell"><header className="admin-header"><div><span className="eyebrow">PRONTUARIO POLITICO / ADMIN</span><h1>Panel de administración</h1></div><a href="/">Volver al sitio ↗</a></header><section className="admin-metrics"><article><span>VISITANTES ÚNICOS / 30 DÍAS</span><strong>{metrics.totals.unique_visitors}</strong></article><article><span>SESIONES</span><strong>{metrics.totals.sessions}</strong></article><article><span>TIEMPO PROMEDIO</span><strong>{averageMinutes}m {averageSeconds}s</strong></article><article><span>ENLACES COPIADOS</span><strong>{metrics.shares}</strong></article></section><section className="admin-grid"><div className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">ACTIVIDAD</span><h2>Visitas recientes</h2></div></div><div className="admin-table">{metrics.recent.map((row) => <div className="admin-row" key={row.day}><span>{row.day}</span><strong>{row.unique_visitors} únicos</strong><span>{row.visits} sesiones</span></div>)}</div></div><div className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">NAVEGACIÓN</span><h2>Páginas más vistas</h2></div></div><div className="admin-table">{metrics.paths.map((row) => <div className="admin-row" key={row.path}><span>{row.path}</span><strong>{row.views}</strong></div>)}</div></div></section><section className="admin-panel admin-reports"><div className="admin-panel-heading"><div><span className="eyebrow">MODERACIÓN</span><h2>Reportes de datos</h2></div></div>{metrics.reports.length === 0 ? <p className="admin-empty">Todavía no hay reportes.</p> : <div className="admin-report-list">{metrics.reports.map((report) => <article className="admin-report" key={report.id}><div className="admin-report-copy"><div className="admin-report-meta"><strong>{report.profile_name}</strong><span>{report.moderation_status} · {report.moderation_confidence}</span><time>{new Date(report.created_at).toLocaleString("es-AR")}</time></div><p>{report.issue}</p><a href={report.source_url} target="_blank" rel="noreferrer">Ver fuente ↗</a>{report.moderation_reason && <small>{report.moderation_reason}</small>}{report.proposed_correction && <blockquote>{report.proposed_correction}</blockquote>}</div><div className="admin-report-actions"><button type="button" onClick={() => void decideReport(report.id, "approved")} disabled={report.status === "approved"}>Aprobar</button><button type="button" onClick={() => void decideReport(report.id, "rejected")} disabled={report.status === "rejected"}>Rechazar</button></div></article>)}</div>}{error && <p className="admin-error">{error}</p>}</section></main>;
}