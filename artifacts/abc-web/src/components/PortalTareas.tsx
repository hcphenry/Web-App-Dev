import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Plus, Pencil, Trash2, CheckCircle2, AlertCircle,
  Clock, Loader2, Users, BrainCircuit, BarChart3, Target, ListChecks,
  PlayCircle, XCircle, Calendar as CalendarIcon, Building2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────
interface TaskCatalog {
  id: number; key: string; name: string; description: string;
  icon: string; color: string; badgeColor: string;
  routePath: string | null;
  targetRole: "paciente" | "psicologo";
  isActive: boolean; isAvailable: boolean;
}
interface Paciente { id: number; name: string; email: string; }
interface Psicologo { id: number; name: string; email: string; }
type Status = "pendiente" | "en_progreso" | "completada" | "cancelada";
interface Assignment {
  id: number;
  taskId: number; taskKey: string; taskName: string; taskIcon: string; taskColor: string;
  targetRole: "paciente" | "psicologo";
  pacienteId: number; pacienteName: string; pacienteEmail: string;
  psicologoId: number | null; psicologoName: string | null;
  assignedById: number | null; assignedByName: string | null;
  status: Status;
  dueDate: string | null;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}
interface ReportePaciente {
  pacienteId: number; pacienteName: string; pacienteEmail: string;
  total: number; pendientes: number; enProgreso: number;
  completadas: number; canceladas: number; completitudPct: number;
}
interface ReportePsicologo {
  psicologoId: number; psicologoName: string;
  total: number; pendientes: number; enProgreso: number;
  completadas: number; canceladas: number; completitudPct: number;
}
interface ReporteCentro {
  totals: {
    total: number; pendientes: number; enProgreso: number;
    completadas: number; canceladas: number;
    pacientesActivos: number; psicologosActivos: number;
    completitudPct: number;
  };
  byTask: { taskId: number; taskKey: string; taskName: string;
            total: number; completadas: number; completitudPct: number; }[];
}

const statusConfig: Record<Status, { label: string; chip: string; icon: typeof Clock }> = {
  pendiente:   { label: "Pendiente",   chip: "bg-amber-100 text-amber-700 border-amber-200",       icon: Clock },
  en_progreso: { label: "En progreso", chip: "bg-sky-100 text-sky-700 border-sky-200",             icon: PlayCircle },
  completada:  { label: "Completada",  chip: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelada:   { label: "Cancelada",   chip: "bg-slate-100 text-slate-600 border-slate-200",       icon: XCircle },
};

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Main component ──────────────────────────────────────────────────────
export default function PortalTareas() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"asignaciones" | "reportes" | "catalogo">("asignaciones");
  const [filterPaciente, setFilterPaciente] = useState("all");
  const [filterPsicologo, setFilterPsicologo] = useState("all");
  const [filterTask, setFilterTask] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // ─── Queries ────────────────────────────────────────────────────────────
  const catalogQ = useQuery<TaskCatalog[]>({
    queryKey: ["tareas", "catalog"],
    queryFn: async () => (await fetch("/api/tareas/catalog")).json(),
  });
  const pacientesQ = useQuery<Paciente[]>({
    queryKey: ["tareas", "lookup", "pacientes"],
    queryFn: async () => (await fetch("/api/tareas/lookup/pacientes")).json(),
  });
  const psicologosQ = useQuery<Psicologo[]>({
    queryKey: ["tareas", "lookup", "psicologos"],
    queryFn: async () => (await fetch("/api/tareas/lookup/psicologos")).json(),
  });

  const assignmentsParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filterPaciente !== "all") p.set("pacienteId", filterPaciente);
    if (filterPsicologo !== "all") p.set("psicologoId", filterPsicologo);
    if (filterTask !== "all") p.set("taskId", filterTask);
    if (filterStatus !== "all") p.set("status", filterStatus);
    return p.toString();
  }, [filterPaciente, filterPsicologo, filterTask, filterStatus]);

  const assignmentsQ = useQuery<Assignment[]>({
    queryKey: ["tareas", "assignments", assignmentsParams],
    queryFn: async () => (await fetch(`/api/tareas/assignments?${assignmentsParams}`)).json(),
  });

  const reportPacQ = useQuery<ReportePaciente[]>({
    queryKey: ["tareas", "reports", "by-paciente"],
    queryFn: async () => (await fetch("/api/tareas/reports/by-paciente")).json(),
    enabled: tab === "reportes",
  });
  const reportPsiQ = useQuery<ReportePsicologo[]>({
    queryKey: ["tareas", "reports", "by-psicologo"],
    queryFn: async () => (await fetch("/api/tareas/reports/by-psicologo")).json(),
    enabled: tab === "reportes",
  });
  const reportCenQ = useQuery<ReporteCentro>({
    queryKey: ["tareas", "reports", "centro"],
    queryFn: async () => (await fetch("/api/tareas/reports/centro")).json(),
    enabled: tab === "reportes",
  });

  const catalog = catalogQ.data ?? [];
  const pacientes = pacientesQ.data ?? [];
  const psicologos = psicologosQ.data ?? [];
  const assignments = assignmentsQ.data ?? [];

  // ─── KPIs (computed client-side from filtered list) ────────────────────
  const kpis = useMemo(() => {
    const acc = { total: 0, pendientes: 0, enProgreso: 0, completadas: 0, canceladas: 0 };
    for (const a of assignments) {
      acc.total++;
      if (a.status === "pendiente") acc.pendientes++;
      else if (a.status === "en_progreso") acc.enProgreso++;
      else if (a.status === "completada") acc.completadas++;
      else if (a.status === "cancelada") acc.canceladas++;
    }
    return { ...acc, completitudPct: acc.total ? Math.round((acc.completadas / acc.total) * 100) : 0 };
  }, [assignments]);

  // ─── Assignment modal (create / edit) ───────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [form, setForm] = useState({
    taskId: "", pacienteId: "", psicologoId: "",
    dueDate: "", status: "pendiente" as Status, notes: "",
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ taskId: "", pacienteId: "", psicologoId: "",
      dueDate: "", status: "pendiente", notes: "" });
    setModalOpen(true);
  };
  const openEdit = (a: Assignment) => {
    setEditing(a);
    setForm({
      taskId: String(a.taskId),
      pacienteId: String(a.pacienteId),
      psicologoId: a.psicologoId ? String(a.psicologoId) : "",
      dueDate: a.dueDate ? toLocalInput(new Date(a.dueDate)) : "",
      status: a.status,
      notes: a.notes ?? "",
    });
    setModalOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        psicologoId: form.psicologoId ? parseInt(form.psicologoId) : null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        notes: form.notes || null,
        status: form.status,
      };
      if (!editing) {
        body.taskId = parseInt(form.taskId);
        body.pacienteId = parseInt(form.pacienteId);
      }
      const url = editing ? `/api/tareas/assignments/${editing.id}` : "/api/tareas/assignments";
      const r = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      toast({ title: editing ? "Asignación actualizada" : "Tarea asignada" });
      setModalOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Delete confirmation ────────────────────────────────────────────────
  const [delTarget, setDelTarget] = useState<Assignment | null>(null);
  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tareas/assignments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      toast({ title: "Asignación eliminada" });
      setDelTarget(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Catálogo: toggle availability ──────────────────────────────────────
  const toggleAvailMut = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: number; isAvailable: boolean }) => {
      const r = await fetch(`/api/tareas/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      toast({ title: "Catálogo actualizado" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Catálogo: cambiar destinatario (paciente / psicólogo) ──────────────
  const setTargetRoleMut = useMutation({
    mutationFn: async ({ id, targetRole }: { id: number; targetRole: "paciente" | "psicologo" }) => {
      const r = await fetch(`/api/tareas/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error");
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tareas"] });
      toast({
        title: "Destinatario actualizado",
        description: vars.targetRole === "psicologo" ? "Ahora es una tarea para psicólogos." : "Ahora es una tarea para pacientes.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ─── Render helpers ─────────────────────────────────────────────────────
  const renderStatusChip = (s: Status) => {
    const cfg = statusConfig[s];
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.chip}`}>
        <Icon className="w-3 h-3" /> {cfg.label}
      </span>
    );
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const isLoading = catalogQ.isLoading || pacientesQ.isLoading || psicologosQ.isLoading || assignmentsQ.isLoading;

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="glass-panel rounded-2xl p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-teal-600" />
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">Portal Tareas Terapéuticas</h2>
              <p className="text-xs text-muted-foreground">Asigna tareas del catálogo a tus pacientes y monitorea su progreso.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="rounded-full bg-teal-600 hover:bg-teal-700" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Nueva asignación
            </Button>
          </div>
        </div>

        {/* Toolbar filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <Select value={filterPaciente} onValueChange={setFilterPaciente}>
            <SelectTrigger className="rounded-full bg-white"><SelectValue placeholder="Paciente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pacientes</SelectItem>
              {pacientes.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPsicologo} onValueChange={setFilterPsicologo}>
            <SelectTrigger className="rounded-full bg-white"><SelectValue placeholder="Psicólogo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los psicólogos</SelectItem>
              {psicologos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTask} onValueChange={setFilterTask}>
            <SelectTrigger className="rounded-full bg-white"><SelectValue placeholder="Tarea" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las tareas</SelectItem>
              {catalog.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-full bg-white"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="en_progreso">En progreso</SelectItem>
              <SelectItem value="completada">Completada</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Asignadas",   value: kpis.total,        color: "from-teal-500 to-teal-600",       icon: <ListChecks className="w-5 h-5" /> },
          { label: "Pendientes",  value: kpis.pendientes,   color: "from-amber-500 to-amber-600",     icon: <Clock className="w-5 h-5" /> },
          { label: "En progreso", value: kpis.enProgreso,   color: "from-sky-500 to-sky-600",         icon: <PlayCircle className="w-5 h-5" /> },
          { label: "Completadas", value: kpis.completadas,  color: "from-emerald-500 to-emerald-600", icon: <CheckCircle2 className="w-5 h-5" /> },
          { label: "Completitud", value: `${kpis.completitudPct}%`, color: "from-violet-500 to-violet-600", icon: <Target className="w-5 h-5" /> },
        ].map(k => (
          <div key={k.label} className="glass-panel rounded-2xl p-4 border shadow-sm relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${k.color} opacity-5`} />
            <div className="relative">
              <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br ${k.color} text-white shadow mb-2`}>
                {k.icon}
              </div>
              <p className="text-2xl font-bold font-display">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="bg-white/50 border backdrop-blur-md rounded-xl p-1 h-auto">
          <TabsTrigger value="asignaciones" className="rounded-lg data-[state=active]:bg-white">
            <ListChecks className="w-4 h-4 mr-1.5" /> Asignaciones
          </TabsTrigger>
          <TabsTrigger value="reportes" className="rounded-lg data-[state=active]:bg-white">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Reportes
          </TabsTrigger>
          <TabsTrigger value="catalogo" className="rounded-lg data-[state=active]:bg-white">
            <ClipboardList className="w-4 h-4 mr-1.5" /> Catálogo
          </TabsTrigger>
        </TabsList>

        {/* ── ASIGNACIONES TAB ── */}
        <TabsContent value="asignaciones" className="mt-4">
          <div className="glass-panel rounded-2xl border shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-7 h-7 animate-spin text-teal-600" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-12 px-4">
                <ClipboardList className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-muted-foreground">No hay asignaciones que coincidan con los filtros.</p>
                <Button size="sm" className="mt-4 rounded-full bg-teal-600 hover:bg-teal-700" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1.5" /> Crear la primera
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-200">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Tarea</th>
                      <th className="px-4 py-3">Asignado a</th>
                      <th className="px-4 py-3">Supervisa</th>
                      <th className="px-4 py-3">Asignada</th>
                      <th className="px-4 py-3">Vence</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignments.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-foreground">{a.taskName}</div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${a.targetRole === "psicologo" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                              {a.targetRole === "psicologo" ? "Psicólogo" : "Paciente"}
                            </span>
                          </div>
                          {a.notes && <div className="text-xs text-muted-foreground truncate max-w-xs">{a.notes}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{a.pacienteName}</div>
                          <div className="text-xs text-muted-foreground">{a.pacienteEmail}</div>
                        </td>
                        <td className="px-4 py-3">{a.psicologoName ?? <span className="text-slate-400">—</span>}</td>
                        <td className="px-4 py-3 text-xs">{fmtDate(a.assignedAt)}</td>
                        <td className="px-4 py-3 text-xs">{fmtDate(a.dueDate)}</td>
                        <td className="px-4 py-3">{renderStatusChip(a.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(a)} title="Editar">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700" onClick={() => setDelTarget(a)} title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── REPORTES TAB ── */}
        <TabsContent value="reportes" className="mt-4 space-y-6">
          {/* Centro */}
          <div className="glass-panel rounded-2xl border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="font-semibold">Reporte del centro</h3>
            </div>
            {reportCenQ.isLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
            ) : reportCenQ.data ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { l: "Total", v: reportCenQ.data.totals.total },
                    { l: "Completadas", v: reportCenQ.data.totals.completadas },
                    { l: "Pacientes activos", v: reportCenQ.data.totals.pacientesActivos },
                    { l: "Completitud", v: `${reportCenQ.data.totals.completitudPct}%` },
                  ].map(s => (
                    <div key={s.l} className="rounded-xl bg-slate-50/70 border border-slate-100 px-4 py-3">
                      <p className="text-2xl font-bold font-display">{s.v}</p>
                      <p className="text-xs text-muted-foreground">{s.l}</p>
                    </div>
                  ))}
                </div>
                {reportCenQ.data.byTask.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Por tarea</p>
                    <div className="space-y-2">
                      {reportCenQ.data.byTask.map(t => (
                        <div key={t.taskId} className="flex items-center gap-3">
                          <div className="text-sm font-medium w-44 truncate">{t.taskName}</div>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${t.completitudPct}%` }} />
                          </div>
                          <div className="text-xs text-slate-600 w-32 text-right">
                            {t.completadas}/{t.total} ({t.completitudPct}%)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Por paciente + Por psicólogo */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="glass-panel rounded-2xl border shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-semibold">Por paciente</h3>
              </div>
              {reportPacQ.isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
              ) : (reportPacQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                      <tr><th className="px-2 py-2 text-left">Paciente</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Compl.</th><th className="px-2 py-2 text-right">%</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportPacQ.data!.map(r => (
                        <tr key={r.pacienteId}>
                          <td className="px-2 py-2">
                            <div className="font-medium">{r.pacienteName}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{r.pacienteEmail}</div>
                          </td>
                          <td className="px-2 py-2 text-right font-medium">{r.total}</td>
                          <td className="px-2 py-2 text-right">{r.completadas}</td>
                          <td className="px-2 py-2 text-right">
                            <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                              {r.completitudPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-2xl border shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <h3 className="font-semibold">Por psicólogo</h3>
              </div>
              {reportPsiQ.isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
              ) : (reportPsiQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                      <tr><th className="px-2 py-2 text-left">Psicólogo</th><th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2 text-right">Compl.</th><th className="px-2 py-2 text-right">%</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportPsiQ.data!.map(r => (
                        <tr key={r.psicologoId ?? Math.random()}>
                          <td className="px-2 py-2 font-medium">{r.psicologoName}</td>
                          <td className="px-2 py-2 text-right font-medium">{r.total}</td>
                          <td className="px-2 py-2 text-right">{r.completadas}</td>
                          <td className="px-2 py-2 text-right">
                            <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                              {r.completitudPct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── CATÁLOGO TAB ── */}
        <TabsContent value="catalogo" className="mt-4">
          <div className="glass-panel rounded-2xl border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center">
                <ClipboardList className="w-4 h-4" />
              </div>
              <h3 className="font-semibold">Catálogo de tareas</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Tareas disponibles en el sistema. Marca como "Próximamente" las que aún no están implementadas para que no se asignen.
            </p>
            {catalogQ.isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {catalog.map(t => (
                  <div key={t.id} className="rounded-xl border border-slate-200 bg-white/70 p-4 flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${t.color} text-white flex items-center justify-center flex-shrink-0`}>
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{t.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.badgeColor}`}>
                          {t.isAvailable ? "Disponible" : "Próximamente"}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${t.targetRole === "psicologo" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
                          {t.targetRole === "psicologo" ? "Para psicólogos" : "Para pacientes"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Destinatario</Label>
                          <Select
                            value={t.targetRole}
                            onValueChange={(v) => setTargetRoleMut.mutate({ id: t.id, targetRole: v as "paciente" | "psicologo" })}
                            disabled={setTargetRoleMut.isPending}
                          >
                            <SelectTrigger className="h-8 text-xs w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paciente">Para pacientes</SelectItem>
                              <SelectItem value="psicologo">Para psicólogos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs rounded-full"
                            onClick={() => toggleAvailMut.mutate({ id: t.id, isAvailable: !t.isAvailable })}>
                            {t.isAvailable ? "Marcar próximamente" : "Marcar disponible"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Asignación modal (create / edit) ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar asignación" : "Nueva asignación"}</DialogTitle>
            <DialogDescription>
              {editing ? "Actualiza el estado, vencimiento o notas." : "Asigna una tarea del catálogo a un paciente."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tarea</Label>
              <Select
                value={form.taskId}
                onValueChange={(v) => setForm(f => ({ ...f, taskId: v }))}
                disabled={!!editing}
              >
                <SelectTrigger><SelectValue placeholder="Selecciona una tarea" /></SelectTrigger>
                <SelectContent>
                  {catalog.filter(t => t.isActive).map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} {!t.isAvailable && <span className="text-xs text-muted-foreground">(Próximamente)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const selectedTask = catalog.find(t => String(t.id) === form.taskId);
              const isPsiTask = selectedTask?.targetRole === "psicologo";
              const options = isPsiTask ? psicologos : pacientes;
              return (
                <div>
                  <Label className="text-xs">{isPsiTask ? "Psicólogo asignado" : "Paciente"}</Label>
                  <Select
                    value={form.pacienteId}
                    onValueChange={(v) => setForm(f => ({ ...f, pacienteId: v }))}
                    disabled={!!editing || !form.taskId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.taskId ? `Selecciona un ${isPsiTask ? "psicólogo" : "paciente"}` : "Selecciona una tarea primero"} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name} <span className="text-xs text-muted-foreground">{p.email}</span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

            <div>
              <Label className="text-xs">Psicólogo (opcional)</Label>
              <Select
                value={form.psicologoId || "__none__"}
                onValueChange={(v) => setForm(f => ({ ...f, psicologoId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Sin psicólogo asignado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin psicólogo</SelectItem>
                  {psicologos.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vence (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as Status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="en_progreso">En progreso</SelectItem>
                    <SelectItem value="completada">Completada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Indicaciones, contexto, observaciones..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              disabled={saveMut.isPending || (!editing && (!form.taskId || !form.pacienteId))}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing ? "Guardar" : "Asignar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar asignación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la asignación de <strong>{delTarget?.taskName}</strong> a <strong>{delTarget?.pacienteName}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delTarget && deleteMut.mutate(delTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
