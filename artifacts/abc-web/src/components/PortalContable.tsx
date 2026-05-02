import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard, Receipt, FileText, Wallet, Plus, Pencil, Trash2,
  CheckCircle2, AlertCircle, Clock, Search, TrendingUp, DollarSign,
  Users, BrainCircuit, Loader2, Save, BarChart3,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────
interface Tarifa {
  id: number;
  pacienteId: number;
  pacienteName: string;
  pacienteEmail: string;
  montoPorSesion: number;
  moneda: string;
  vigenteDesde: string;
  updatedAt: string;
}
interface Paciente {
  id: number; name: string; email: string; costoTerapia: string | null;
}
interface Psicologo {
  id: number; name: string; email: string; comisionPct: string | null;
}
interface Sesion {
  id: number;
  pacienteId: number; pacienteName: string; pacienteEmail: string;
  psicologoId: number; psicologoName: string;
  fechaSesion: string;
  montoCobrado: number; moneda: string;
  estadoPago: "pagado" | "pendiente" | "deuda";
  fechaPago: string | null;
  metodoPago: string | null;
  notas: string | null;
  createdAt: string;
}
interface ReporteClinica {
  kpis: {
    totalSesiones: number; totalRecaudado: number;
    totalPendiente: number; totalDeuda: number;
    sesionesPagadas: number; sesionesPendientes: number; sesionesDeuda: number;
  };
  monthly: { mes: string; recaudado: number; pendiente: number; sesiones: number }[];
}
interface ReportePaciente {
  pacienteId: number; pacienteName: string; pacienteEmail: string;
  totalSesiones: number; totalRecaudado: number;
  totalPendiente: number; totalDeuda: number; totalGeneral: number;
}
interface ReportePsicologo {
  psicologoId: number; psicologoName: string; psicologoEmail: string;
  comisionPct: number;
  totalSesiones: number; totalRecaudado: number;
  totalPendiente: number; totalDeuda: number;
  comisionCalculada: number; neto: number;
}

const fmtMoney = (n: number, moneda = "PEN") => {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency: moneda }).format(n);
  } catch {
    return `${moneda || "PEN"} ${n.toFixed(2)}`;
  }
};

const fmtDateTime = (iso: string) =>
  format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: es });

const fmtDate = (iso: string) =>
  format(parseISO(iso), "d MMM yyyy", { locale: es });

const estadoConfig = {
  pagado: { label: "Pagado", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pendiente: { label: "Pendiente", icon: Clock, cls: "bg-amber-100 text-amber-700 border-amber-200" },
  deuda: { label: "Deuda", icon: AlertCircle, cls: "bg-rose-100 text-rose-700 border-rose-200" },
};

function EstadoBadge({ estado }: { estado: Sesion["estadoPago"] }) {
  const c = estadoConfig[estado];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${c.cls}`}>
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function PortalContable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("dashboard");

  // ─── Data queries ───────────────────────────────────────────────────────
  const { data: clinica, isLoading: loadingClinica } = useQuery<ReporteClinica>({
    queryKey: ["contabilidad", "clinica"],
    queryFn: async () => {
      const r = await fetch("/api/contabilidad/reportes/clinica");
      if (!r.ok) throw new Error("Error cargando reporte");
      return r.json();
    },
  });

  const { data: tarifas = [], isLoading: loadingTarifas } = useQuery<Tarifa[]>({
    queryKey: ["contabilidad", "tarifas"],
    queryFn: async () => {
      const r = await fetch("/api/contabilidad/tarifas");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ["contabilidad", "pacientes"],
    queryFn: async () => {
      const r = await fetch("/api/contabilidad/pacientes");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const { data: psicologos = [] } = useQuery<Psicologo[]>({
    queryKey: ["contabilidad", "psicologos"],
    queryFn: async () => {
      const r = await fetch("/api/contabilidad/psicologos");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  // ─── Tarifas state ──────────────────────────────────────────────────────
  const [tarifaModalOpen, setTarifaModalOpen] = useState(false);
  const [tarifaForm, setTarifaForm] = useState({ pacienteId: "", monto: "", moneda: "PEN" });

  const upsertTarifaMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/contabilidad/tarifas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pacienteId: parseInt(tarifaForm.pacienteId),
          montoPorSesion: parseFloat(tarifaForm.monto),
          moneda: tarifaForm.moneda,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Tarifa guardada" });
      setTarifaModalOpen(false);
      setTarifaForm({ pacienteId: "", monto: "", moneda: "PEN" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [tarifaToDelete, setTarifaToDelete] = useState<Tarifa | null>(null);
  const deleteTarifaMut = useMutation({
    mutationFn: async (pacienteId: number) => {
      const r = await fetch(`/api/contabilidad/tarifas/${pacienteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Tarifa eliminada" });
      setTarifaToDelete(null);
    },
  });

  // ─── Sesiones state ─────────────────────────────────────────────────────
  const [sesionFilters, setSesionFilters] = useState({ estado: "all", search: "", psicologoId: "all", from: "", to: "" });
  const sesionQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (sesionFilters.estado !== "all") p.set("estado", sesionFilters.estado);
    if (sesionFilters.search) p.set("search", sesionFilters.search);
    if (sesionFilters.psicologoId !== "all") p.set("psicologoId", sesionFilters.psicologoId);
    if (sesionFilters.from) p.set("from", sesionFilters.from);
    if (sesionFilters.to) p.set("to", sesionFilters.to);
    return p.toString();
  }, [sesionFilters]);

  const { data: sesiones = [], isLoading: loadingSesiones } = useQuery<Sesion[]>({
    queryKey: ["contabilidad", "sesiones", sesionQuery],
    queryFn: async () => {
      const r = await fetch(`/api/contabilidad/sesiones?${sesionQuery}`);
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const [sesionModalOpen, setSesionModalOpen] = useState(false);
  const [editingSesion, setEditingSesion] = useState<Sesion | null>(null);
  const [sesionForm, setSesionForm] = useState({
    pacienteId: "", psicologoId: "", fechaSesion: "", montoCobrado: "",
    estadoPago: "pendiente", metodoPago: "", notas: "",
  });

  const openCreateSesion = () => {
    setEditingSesion(null);
    const now = new Date();
    const ymdHm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setSesionForm({
      pacienteId: "", psicologoId: "", fechaSesion: ymdHm,
      montoCobrado: "", estadoPago: "pendiente", metodoPago: "", notas: "",
    });
    setSesionModalOpen(true);
  };

  const openEditSesion = (s: Sesion) => {
    setEditingSesion(s);
    const d = new Date(s.fechaSesion);
    const ymdHm = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    setSesionForm({
      pacienteId: String(s.pacienteId),
      psicologoId: String(s.psicologoId),
      fechaSesion: ymdHm,
      montoCobrado: String(s.montoCobrado),
      estadoPago: s.estadoPago,
      metodoPago: s.metodoPago || "",
      notas: s.notas || "",
    });
    setSesionModalOpen(true);
  };

  const saveSesionMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        pacienteId: parseInt(sesionForm.pacienteId),
        psicologoId: parseInt(sesionForm.psicologoId),
        fechaSesion: new Date(sesionForm.fechaSesion).toISOString(),
        estadoPago: sesionForm.estadoPago,
        metodoPago: sesionForm.metodoPago || null,
        notas: sesionForm.notas || null,
      };
      if (sesionForm.montoCobrado) body.montoCobrado = parseFloat(sesionForm.montoCobrado);

      const url = editingSesion
        ? `/api/contabilidad/sesiones/${editingSesion.id}`
        : "/api/contabilidad/sesiones";
      const method = editingSesion ? "PATCH" : "POST";

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: editingSesion ? "Sesión actualizada" : "Sesión registrada" });
      setSesionModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaidMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/contabilidad/sesiones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadoPago: "pagado" }),
      });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Sesión marcada como pagada" });
    },
  });

  const [sesionToDelete, setSesionToDelete] = useState<Sesion | null>(null);
  const deleteSesionMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/contabilidad/sesiones/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Sesión eliminada" });
      setSesionToDelete(null);
    },
  });

  // ─── Reportes ───────────────────────────────────────────────────────────
  const { data: repPacientes = [], isLoading: loadingRepPac } = useQuery<ReportePaciente[]>({
    queryKey: ["contabilidad", "reportes", "paciente"],
    queryFn: async () => {
      const r = await fetch("/api/contabilidad/reportes/paciente");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const { data: repPsicologos = [], isLoading: loadingRepPsi } = useQuery<ReportePsicologo[]>({
    queryKey: ["contabilidad", "reportes", "psicologo"],
    queryFn: async () => {
      const r = await fetch("/api/contabilidad/reportes/psicologo");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const exportCSV = (rows: any[], filename: string) => {
    if (!rows.length) { toast({ title: "Nada que exportar" }); return; }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => {
        const v = r[h];
        if (v === null || v === undefined) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Tabs value={subTab} onValueChange={setSubTab} className="w-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-4 p-1 bg-white/50 border backdrop-blur-md rounded-xl h-auto">
          <TabsTrigger value="dashboard" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LayoutDashboard className="w-4 h-4 mr-1.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="tarifas" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Wallet className="w-4 h-4 mr-1.5" /> Tarifas
          </TabsTrigger>
          <TabsTrigger value="sesiones" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Receipt className="w-4 h-4 mr-1.5" /> Sesiones
          </TabsTrigger>
          <TabsTrigger value="reportes" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Reportes
          </TabsTrigger>
        </TabsList>

        {/* ─── DASHBOARD ──────────────────────────────────────────────── */}
        <TabsContent value="dashboard" className="mt-6 space-y-6">
          {loadingClinica ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
            </div>
          ) : clinica ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total recaudado" value={fmtMoney(clinica.kpis.totalRecaudado)}
                  icon={DollarSign} color="emerald" sub={`${clinica.kpis.sesionesPagadas} sesiones pagadas`} />
                <KpiCard label="Pagos pendientes" value={fmtMoney(clinica.kpis.totalPendiente)}
                  icon={Clock} color="amber" sub={`${clinica.kpis.sesionesPendientes} sesiones`} />
                <KpiCard label="En deuda" value={fmtMoney(clinica.kpis.totalDeuda)}
                  icon={AlertCircle} color="rose" sub={`${clinica.kpis.sesionesDeuda} sesiones`} />
                <KpiCard label="Total sesiones" value={String(clinica.kpis.totalSesiones)}
                  icon={Receipt} color="teal" sub="Histórico" />
              </div>

              {clinica.monthly.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Recaudación mensual (últimos 12 meses)</h3>
                  </div>
                  <MonthlyChart data={clinica.monthly} />
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-500 py-12">No hay datos</div>
          )}
        </TabsContent>

        {/* ─── TARIFAS ────────────────────────────────────────────────── */}
        <TabsContent value="tarifas" className="mt-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-800">Tarifas por paciente</h3>
                <p className="text-sm text-slate-500">Monto que se cobra por cada sesión de terapia</p>
              </div>
              <Button onClick={() => { setTarifaForm({ pacienteId: "", monto: "", moneda: "PEN" }); setTarifaModalOpen(true); }}
                className="rounded-full bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-1.5" /> Nueva tarifa
              </Button>
            </div>

            {loadingTarifas ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              </div>
            ) : tarifas.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                <Wallet className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No hay tarifas registradas. Crea la primera para comenzar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-medium">Paciente</th>
                      <th className="py-2 px-3 font-medium">Email</th>
                      <th className="py-2 px-3 font-medium text-right">Monto / sesión</th>
                      <th className="py-2 px-3 font-medium">Vigente desde</th>
                      <th className="py-2 px-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tarifas.map(t => (
                      <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-medium text-slate-800">{t.pacienteName}</td>
                        <td className="py-3 px-3 text-slate-600">{t.pacienteEmail}</td>
                        <td className="py-3 px-3 text-right font-semibold text-teal-700">{fmtMoney(t.montoPorSesion, t.moneda)}</td>
                        <td className="py-3 px-3 text-slate-600">{fmtDate(t.vigenteDesde)}</td>
                        <td className="py-3 px-3 text-right">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                            onClick={() => { setTarifaForm({ pacienteId: String(t.pacienteId), monto: String(t.montoPorSesion), moneda: t.moneda }); setTarifaModalOpen(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                            onClick={() => setTarifaToDelete(t)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── SESIONES ───────────────────────────────────────────────── */}
        <TabsContent value="sesiones" className="mt-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-800">Sesiones contables</h3>
                <p className="text-sm text-slate-500">Registro de sesiones realizadas y su estado de pago</p>
              </div>
              <Button onClick={openCreateSesion} className="rounded-full bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-1.5" /> Registrar sesión
              </Button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar paciente…"
                  value={sesionFilters.search}
                  onChange={e => setSesionFilters(f => ({ ...f, search: e.target.value }))}
                  className="pl-9 rounded-lg"
                />
              </div>
              <Select value={sesionFilters.estado} onValueChange={v => setSesionFilters(f => ({ ...f, estado: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="deuda">Deuda</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sesionFilters.psicologoId} onValueChange={v => setSesionFilters(f => ({ ...f, psicologoId: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Psicólogo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los psicólogos</SelectItem>
                  {psicologos.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="date" value={sesionFilters.from} onChange={e => setSesionFilters(f => ({ ...f, from: e.target.value }))} className="rounded-lg" />
                <Input type="date" value={sesionFilters.to} onChange={e => setSesionFilters(f => ({ ...f, to: e.target.value }))} className="rounded-lg" />
              </div>
            </div>

            {loadingSesiones ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
              </div>
            ) : sesiones.length === 0 ? (
              <div className="text-center text-slate-500 py-12">
                <Receipt className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No hay sesiones registradas para los filtros seleccionados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-medium">Fecha</th>
                      <th className="py-2 px-3 font-medium">Paciente</th>
                      <th className="py-2 px-3 font-medium">Psicólogo</th>
                      <th className="py-2 px-3 font-medium text-right">Monto</th>
                      <th className="py-2 px-3 font-medium">Estado</th>
                      <th className="py-2 px-3 font-medium">Pagado el</th>
                      <th className="py-2 px-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sesiones.map(s => (
                      <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-3 text-slate-700 whitespace-nowrap">{fmtDateTime(s.fechaSesion)}</td>
                        <td className="py-3 px-3 font-medium text-slate-800">{s.pacienteName}</td>
                        <td className="py-3 px-3 text-slate-600">{s.psicologoName}</td>
                        <td className="py-3 px-3 text-right font-semibold">{fmtMoney(s.montoCobrado, s.moneda)}</td>
                        <td className="py-3 px-3"><EstadoBadge estado={s.estadoPago} /></td>
                        <td className="py-3 px-3 text-slate-600">{s.fechaPago ? fmtDate(s.fechaPago) : "—"}</td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {s.estadoPago !== "pagado" && (
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => markPaidMut.mutate(s.id)}
                              disabled={markPaidMut.isPending}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Pagar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditSesion(s)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                            onClick={() => setSesionToDelete(s)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── REPORTES ───────────────────────────────────────────────── */}
        <TabsContent value="reportes" className="mt-6 space-y-6">
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                <h3 className="font-semibold text-slate-800">Reporte por paciente</h3>
              </div>
              <Button size="sm" variant="outline" className="rounded-full"
                onClick={() => exportCSV(repPacientes, `reporte_pacientes_${format(new Date(),'yyyy-MM-dd')}.csv`)}>
                <FileText className="w-4 h-4 mr-1.5" /> Exportar CSV
              </Button>
            </div>
            {loadingRepPac ? (
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
            ) : repPacientes.length === 0 ? (
              <p className="text-center text-slate-500 py-8">Sin datos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-medium">Paciente</th>
                      <th className="py-2 px-3 font-medium text-right">Sesiones</th>
                      <th className="py-2 px-3 font-medium text-right">Recaudado</th>
                      <th className="py-2 px-3 font-medium text-right">Pendiente</th>
                      <th className="py-2 px-3 font-medium text-right">Deuda</th>
                      <th className="py-2 px-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repPacientes.map(r => (
                      <tr key={r.pacienteId} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-medium text-slate-800">
                          {r.pacienteName}
                          <div className="text-xs text-slate-500">{r.pacienteEmail}</div>
                        </td>
                        <td className="py-3 px-3 text-right">{r.totalSesiones}</td>
                        <td className="py-3 px-3 text-right font-semibold text-emerald-700">{fmtMoney(r.totalRecaudado)}</td>
                        <td className="py-3 px-3 text-right text-amber-700">{fmtMoney(r.totalPendiente)}</td>
                        <td className="py-3 px-3 text-right text-rose-700">{fmtMoney(r.totalDeuda)}</td>
                        <td className="py-3 px-3 text-right font-semibold">{fmtMoney(r.totalGeneral)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-teal-600" />
                <h3 className="font-semibold text-slate-800">Reporte por psicólogo</h3>
              </div>
              <Button size="sm" variant="outline" className="rounded-full"
                onClick={() => exportCSV(repPsicologos, `reporte_psicologos_${format(new Date(),'yyyy-MM-dd')}.csv`)}>
                <FileText className="w-4 h-4 mr-1.5" /> Exportar CSV
              </Button>
            </div>
            {loadingRepPsi ? (
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
            ) : repPsicologos.length === 0 ? (
              <p className="text-center text-slate-500 py-8">Sin datos</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-medium">Psicólogo</th>
                      <th className="py-2 px-3 font-medium text-right">Sesiones</th>
                      <th className="py-2 px-3 font-medium text-right">Recaudado</th>
                      <th className="py-2 px-3 font-medium text-right">Comisión %</th>
                      <th className="py-2 px-3 font-medium text-right">Comisión</th>
                      <th className="py-2 px-3 font-medium text-right">Neto clínica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repPsicologos.map(r => (
                      <tr key={r.psicologoId} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-medium text-slate-800">
                          {r.psicologoName}
                          <div className="text-xs text-slate-500">{r.psicologoEmail}</div>
                        </td>
                        <td className="py-3 px-3 text-right">{r.totalSesiones}</td>
                        <td className="py-3 px-3 text-right font-semibold text-emerald-700">{fmtMoney(r.totalRecaudado)}</td>
                        <td className="py-3 px-3 text-right">{r.comisionPct}%</td>
                        <td className="py-3 px-3 text-right text-indigo-700">{fmtMoney(r.comisionCalculada)}</td>
                        <td className="py-3 px-3 text-right font-semibold">{fmtMoney(r.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Tarifa modal ──────────────────────────────────────────────── */}
      <Dialog open={tarifaModalOpen} onOpenChange={setTarifaModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{tarifaForm.pacienteId && tarifas.find(t => t.pacienteId === parseInt(tarifaForm.pacienteId)) ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Paciente</Label>
              <Select value={tarifaForm.pacienteId} onValueChange={v => setTarifaForm(f => ({ ...f, pacienteId: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Seleccionar paciente" /></SelectTrigger>
                <SelectContent>
                  {pacientes.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Monto por sesión</Label>
                <Input type="number" step="0.01" min="0" value={tarifaForm.monto}
                  onChange={e => setTarifaForm(f => ({ ...f, monto: e.target.value }))} className="rounded-lg" />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={tarifaForm.moneda} onValueChange={v => setTarifaForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PEN">PEN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setTarifaModalOpen(false)}>Cancelar</Button>
            <Button className="rounded-full bg-teal-600 hover:bg-teal-700"
              onClick={() => upsertTarifaMut.mutate()}
              disabled={!tarifaForm.pacienteId || !tarifaForm.monto || upsertTarifaMut.isPending}>
              {upsertTarifaMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Sesion modal ──────────────────────────────────────────────── */}
      <Dialog open={sesionModalOpen} onOpenChange={setSesionModalOpen}>
        <DialogContent className="rounded-2xl max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingSesion ? "Editar sesión" : "Registrar sesión"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paciente</Label>
                <Select value={sesionForm.pacienteId} onValueChange={v => setSesionForm(f => ({ ...f, pacienteId: v }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {pacientes.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Psicólogo</Label>
                <Select value={sesionForm.psicologoId} onValueChange={v => setSesionForm(f => ({ ...f, psicologoId: v }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {psicologos.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha de sesión</Label>
                <Input type="datetime-local" value={sesionForm.fechaSesion}
                  onChange={e => setSesionForm(f => ({ ...f, fechaSesion: e.target.value }))} className="rounded-lg" />
              </div>
              <div>
                <Label>Monto cobrado <span className="text-xs text-slate-400">(vacío = tarifa)</span></Label>
                <Input type="number" step="0.01" min="0" value={sesionForm.montoCobrado}
                  onChange={e => setSesionForm(f => ({ ...f, montoCobrado: e.target.value }))} className="rounded-lg"
                  placeholder={(() => {
                    const p = pacientes.find(x => String(x.id) === sesionForm.pacienteId);
                    const t = tarifas.find(x => x.pacienteId === parseInt(sesionForm.pacienteId));
                    return t ? String(t.montoPorSesion) : (p?.costoTerapia || "");
                  })()} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estado de pago</Label>
                <Select value={sesionForm.estadoPago} onValueChange={v => setSesionForm(f => ({ ...f, estadoPago: v }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="deuda">En deuda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método de pago</Label>
                <Input value={sesionForm.metodoPago}
                  onChange={e => setSesionForm(f => ({ ...f, metodoPago: e.target.value }))}
                  placeholder="Yape, transferencia, efectivo…" className="rounded-lg" />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={sesionForm.notas} onChange={e => setSesionForm(f => ({ ...f, notas: e.target.value }))} className="rounded-lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setSesionModalOpen(false)}>Cancelar</Button>
            <Button className="rounded-full bg-teal-600 hover:bg-teal-700"
              onClick={() => saveSesionMut.mutate()}
              disabled={!sesionForm.pacienteId || !sesionForm.psicologoId || !sesionForm.fechaSesion || saveSesionMut.isPending}>
              {saveSesionMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {editingSesion ? "Guardar cambios" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirms ───────────────────────────────────────────── */}
      <AlertDialog open={!!tarifaToDelete} onOpenChange={() => setTarifaToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la tarifa de {tarifaToDelete?.pacienteName}. Esta acción no afecta sesiones ya registradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-full bg-rose-600 hover:bg-rose-700"
              onClick={() => tarifaToDelete && deleteTarifaMut.mutate(tarifaToDelete.pacienteId)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!sesionToDelete} onOpenChange={() => setSesionToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro contable de {sesionToDelete?.pacienteName} del {sesionToDelete && fmtDateTime(sesionToDelete.fechaSesion)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-full bg-rose-600 hover:bg-rose-700"
              onClick={() => sesionToDelete && deleteSesionMut.mutate(sesionToDelete.id)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-700 border-emerald-200/50",
    amber: "from-amber-500/10 to-amber-500/5 text-amber-700 border-amber-200/50",
    rose: "from-rose-500/10 to-rose-500/5 text-rose-700 border-rose-200/50",
    teal: "from-teal-500/10 to-teal-500/5 text-teal-700 border-teal-200/50",
  };
  return (
    <div className={`glass-panel rounded-2xl p-5 bg-gradient-to-br ${colorMap[color]} border`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <Icon className="w-5 h-5 opacity-70" />
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}

// ─── Monthly Chart ────────────────────────────────────────────────────────
function MonthlyChart({ data }: { data: { mes: string; recaudado: number; pendiente: number; sesiones: number }[] }) {
  const max = Math.max(...data.map(d => Math.max(d.recaudado, d.pendiente)), 1);
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.mes} className="text-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-600 font-medium">
              {format(parseISO(`${d.mes}-01`), "MMMM yyyy", { locale: es })}
            </span>
            <span className="text-slate-500 text-xs">{d.sesiones} sesiones</span>
          </div>
          <div className="flex h-6 rounded-lg overflow-hidden bg-slate-100">
            <div className="bg-emerald-500 transition-all flex items-center justify-end px-2 text-xs text-white font-medium"
              style={{ width: `${(d.recaudado / max) * 100}%` }}>
              {d.recaudado > 0 && fmtMoney(d.recaudado)}
            </div>
            <div className="bg-amber-400 transition-all flex items-center justify-end px-2 text-xs text-white font-medium"
              style={{ width: `${(d.pendiente / max) * 100}%` }}>
              {d.pendiente > 0 && fmtMoney(d.pendiente)}
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Recaudado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> Pendiente</span>
      </div>
    </div>
  );
}
