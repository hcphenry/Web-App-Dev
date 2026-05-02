import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addDays, addWeeks, addMonths,
  isSameDay, isSameMonth, eachDayOfInterval, getHours, getMinutes,
} from "date-fns";
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
  CalendarDays, Plus, Pencil, Trash2, CheckCircle2, AlertCircle,
  Clock, ChevronLeft, ChevronRight, Wallet, Save, Loader2,
  Users, BrainCircuit, FileText, BarChart3, DollarSign, TrendingUp,
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

const estadoConfig = {
  pagado: { label: "Pagado", icon: CheckCircle2, dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 border-emerald-200", soft: "bg-emerald-50 border-l-emerald-500 text-emerald-900" },
  pendiente: { label: "Pendiente", icon: Clock, dot: "bg-amber-500", chip: "bg-amber-100 text-amber-700 border-amber-200", soft: "bg-amber-50 border-l-amber-500 text-amber-900" },
  deuda: { label: "Deuda", icon: AlertCircle, dot: "bg-rose-500", chip: "bg-rose-100 text-rose-700 border-rose-200", soft: "bg-rose-50 border-l-rose-500 text-rose-900" },
};

// Local date <-> input "YYYY-MM-DDTHH:mm" helpers
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type ViewMode = "day" | "week" | "month";

// ─── Main Component ───────────────────────────────────────────────────────
export default function PortalAgenda() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── Calendar navigation state ─────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [filterPsicologo, setFilterPsicologo] = useState("all");
  const [filterEstado, setFilterEstado] = useState("all");

  const range = useMemo(() => {
    if (viewMode === "day") return { from: startOfDay(cursor), to: endOfDay(cursor) };
    if (viewMode === "week") return {
      from: startOfWeek(cursor, { weekStartsOn: 1 }),
      to: endOfWeek(cursor, { weekStartsOn: 1 }),
    };
    return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
  }, [viewMode, cursor]);

  const navigate = (dir: -1 | 0 | 1) => {
    if (dir === 0) { setCursor(new Date()); return; }
    if (viewMode === "day") setCursor(d => addDays(d, dir));
    else if (viewMode === "week") setCursor(d => addWeeks(d, dir));
    else setCursor(d => addMonths(d, dir));
  };

  const periodLabel = useMemo(() => {
    if (viewMode === "day") return format(cursor, "EEEE d 'de' MMMM yyyy", { locale: es });
    if (viewMode === "week") {
      const a = format(range.from, "d MMM", { locale: es });
      const b = format(range.to, "d MMM yyyy", { locale: es });
      return `Semana del ${a} al ${b}`;
    }
    return format(cursor, "MMMM yyyy", { locale: es });
  }, [viewMode, cursor, range]);

  // ─── Data: helpers ──────────────────────────────────────────────────────
  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ["agenda", "pacientes"],
    queryFn: async () => {
      const r = await fetch("/api/agenda/pacientes");
      if (!r.ok) throw new Error("Error cargando pacientes");
      return r.json();
    },
  });

  const { data: psicologos = [] } = useQuery<Psicologo[]>({
    queryKey: ["agenda", "psicologos"],
    queryFn: async () => {
      const r = await fetch("/api/agenda/psicologos");
      if (!r.ok) throw new Error("Error cargando psicólogos");
      return r.json();
    },
  });

  // ─── Data: sesiones in current view range ──────────────────────────────
  const sesionesQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from.toISOString());
    p.set("to", range.to.toISOString());
    if (filterPsicologo !== "all") p.set("psicologoId", filterPsicologo);
    if (filterEstado !== "all") p.set("estado", filterEstado);
    return p.toString();
  }, [range, filterPsicologo, filterEstado]);

  const { data: sesiones = [], isLoading: loadingSesiones } = useQuery<Sesion[]>({
    queryKey: ["agenda", "sesiones", sesionesQuery],
    queryFn: async () => {
      const r = await fetch(`/api/agenda/sesiones?${sesionesQuery}`);
      if (!r.ok) throw new Error("Error cargando sesiones");
      return r.json();
    },
  });

  // ─── Data: KPIs (clinica report scoped to current range) ───────────────
  const kpiQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from.toISOString());
    p.set("to", range.to.toISOString());
    return p.toString();
  }, [range]);

  const { data: clinica } = useQuery<ReporteClinica>({
    queryKey: ["agenda", "clinica", kpiQuery],
    queryFn: async () => {
      const r = await fetch(`/api/agenda/reportes/clinica?${kpiQuery}`);
      if (!r.ok) throw new Error("Error cargando KPIs");
      return r.json();
    },
  });

  // ─── Data: tarifas list (for tarifas modal/list) ───────────────────────
  const { data: tarifas = [], isLoading: loadingTarifas } = useQuery<Tarifa[]>({
    queryKey: ["agenda", "tarifas"],
    queryFn: async () => {
      const r = await fetch("/api/agenda/tarifas");
      if (!r.ok) throw new Error("Error cargando tarifas");
      return r.json();
    },
  });

  // ─── Sesion modal (create / edit) ──────────────────────────────────────
  const [sesionModalOpen, setSesionModalOpen] = useState(false);
  const [editingSesion, setEditingSesion] = useState<Sesion | null>(null);
  const [sesionForm, setSesionForm] = useState({
    pacienteId: "", psicologoId: "", fechaSesion: "", montoCobrado: "",
    estadoPago: "pendiente", metodoPago: "", notas: "",
  });

  const openCreateSesion = (preset?: Date) => {
    setEditingSesion(null);
    const base = preset ?? new Date();
    if (!preset) base.setMinutes(0, 0, 0);
    setSesionForm({
      pacienteId: "", psicologoId: "",
      fechaSesion: toLocalInput(base),
      montoCobrado: "", estadoPago: "pendiente", metodoPago: "", notas: "",
    });
    setSesionModalOpen(true);
  };

  const openEditSesion = (s: Sesion) => {
    setEditingSesion(s);
    setSesionForm({
      pacienteId: String(s.pacienteId),
      psicologoId: String(s.psicologoId),
      fechaSesion: toLocalInput(new Date(s.fechaSesion)),
      montoCobrado: String(s.montoCobrado),
      estadoPago: s.estadoPago,
      metodoPago: s.metodoPago || "",
      notas: s.notas || "",
    });
    setSesionModalOpen(true);
  };

  const saveSesionMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        pacienteId: parseInt(sesionForm.pacienteId),
        psicologoId: parseInt(sesionForm.psicologoId),
        fechaSesion: new Date(sesionForm.fechaSesion).toISOString(),
        estadoPago: sesionForm.estadoPago,
        metodoPago: sesionForm.metodoPago || null,
        notas: sesionForm.notas || null,
      };
      if (sesionForm.montoCobrado) body.montoCobrado = parseFloat(sesionForm.montoCobrado);
      const url = editingSesion
        ? `/api/agenda/sesiones/${editingSesion.id}`
        : "/api/agenda/sesiones";
      const method = editingSesion ? "PATCH" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: editingSesion ? "Sesión actualizada" : "Sesión registrada" });
      setSesionModalOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaidMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/agenda/sesiones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadoPago: "pagado" }),
      });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Sesión marcada como pagada" });
    },
  });

  const [sesionToDelete, setSesionToDelete] = useState<Sesion | null>(null);
  const deleteSesionMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/agenda/sesiones/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Sesión eliminada" });
      setSesionToDelete(null);
    },
  });

  // ─── Tarifas modal ──────────────────────────────────────────────────────
  const [tarifasOpen, setTarifasOpen] = useState(false);
  const [tarifaModalOpen, setTarifaModalOpen] = useState(false);
  const [tarifaForm, setTarifaForm] = useState({ pacienteId: "", monto: "", moneda: "PEN" });

  const upsertTarifaMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/agenda/tarifas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pacienteId: parseInt(tarifaForm.pacienteId),
          montoPorSesion: parseFloat(tarifaForm.monto),
          moneda: tarifaForm.moneda,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Tarifa guardada" });
      setTarifaModalOpen(false);
      setTarifaForm({ pacienteId: "", monto: "", moneda: "PEN" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [tarifaToDelete, setTarifaToDelete] = useState<Tarifa | null>(null);
  const deleteTarifaMut = useMutation({
    mutationFn: async (pacienteId: number) => {
      const r = await fetch(`/api/agenda/tarifas/${pacienteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Error");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      toast({ title: "Tarifa eliminada" });
      setTarifaToDelete(null);
    },
  });

  // ─── Reports (paciente / psicólogo) ────────────────────────────────────
  const { data: repPacientes = [] } = useQuery<ReportePaciente[]>({
    queryKey: ["agenda", "reportes", "paciente"],
    queryFn: async () => {
      const r = await fetch("/api/agenda/reportes/paciente");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const { data: repPsicologos = [] } = useQuery<ReportePsicologo[]>({
    queryKey: ["agenda", "reportes", "psicologo"],
    queryFn: async () => {
      const r = await fetch("/api/agenda/reportes/psicologo");
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
  });

  const exportCSV = (rows: Record<string, unknown>[], filename: string) => {
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

  // ─── Calendar rendering helpers ────────────────────────────────────────
  const HOUR_START = 7;
  const HOUR_END = 22; // exclusive
  const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const SLOT_HEIGHT = 56; // px per hour

  const sesionesByDay = useMemo(() => {
    const map = new Map<string, Sesion[]>();
    for (const s of sesiones) {
      const d = new Date(s.fechaSesion);
      const key = format(d, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sesiones]);

  const renderEventCard = (s: Sesion, compact = false) => {
    const cls = estadoConfig[s.estadoPago].soft;
    return (
      <button
        key={s.id}
        onClick={(e) => { e.stopPropagation(); openEditSesion(s); }}
        className={`w-full text-left rounded-md border-l-4 px-2 py-1 text-xs leading-tight shadow-sm hover:shadow-md transition-shadow ${cls}`}
        title={`${s.pacienteName} con ${s.psicologoName} — ${fmtMoney(s.montoCobrado, s.moneda)}`}
      >
        <div className="font-medium truncate">
          {format(new Date(s.fechaSesion), "HH:mm")} {s.pacienteName}
        </div>
        {!compact && (
          <div className="opacity-80 truncate">{s.psicologoName} · {fmtMoney(s.montoCobrado, s.moneda)}</div>
        )}
      </button>
    );
  };

  // Day view
  const renderDayView = () => {
    const list = (sesionesByDay.get(format(cursor, "yyyy-MM-dd")) ?? [])
      .slice().sort((a, b) => +new Date(a.fechaSesion) - +new Date(b.fechaSesion));
    return (
      <div className="grid grid-cols-[60px_1fr] gap-0 border border-slate-200 rounded-xl overflow-hidden bg-white/60">
        <div className="border-r border-slate-200">
          {HOURS.map(h => (
            <div key={h} className="text-[10px] text-slate-500 text-right pr-2 -mt-1.5" style={{ height: SLOT_HEIGHT }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="relative">
          {HOURS.map(h => (
            <div
              key={h}
              className="border-b border-slate-100 hover:bg-teal-50/40 cursor-pointer"
              style={{ height: SLOT_HEIGHT }}
              onClick={() => {
                const d = new Date(cursor);
                d.setHours(h, 0, 0, 0);
                openCreateSesion(d);
              }}
            />
          ))}
          {list.map(s => {
            const d = new Date(s.fechaSesion);
            const top = (getHours(d) - HOUR_START) * SLOT_HEIGHT + (getMinutes(d) / 60) * SLOT_HEIGHT;
            const height = Math.max(SLOT_HEIGHT * 0.8, 40);
            if (top < 0 || top >= (HOUR_END - HOUR_START) * SLOT_HEIGHT) return null;
            return (
              <div
                key={s.id}
                className="absolute left-1 right-1"
                style={{ top, height }}
              >
                {renderEventCard(s)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Week view
  const renderWeekView = () => {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return (
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border border-slate-200 rounded-xl overflow-hidden bg-white/60 text-xs">
        <div className="border-r border-slate-200 bg-slate-50/60" />
        {days.map(d => {
          const isToday = isSameDay(d, new Date());
          return (
            <div key={+d} className={`border-r last:border-r-0 border-slate-200 px-2 py-2 text-center ${isToday ? "bg-teal-50" : "bg-slate-50/60"}`}>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                {format(d, "EEE", { locale: es })}
              </div>
              <div className={`text-base font-semibold ${isToday ? "text-teal-700" : "text-slate-700"}`}>
                {format(d, "d")}
              </div>
            </div>
          );
        })}
        <div className="border-r border-slate-200">
          {HOURS.map(h => (
            <div key={h} className="text-[10px] text-slate-500 text-right pr-2 -mt-1.5" style={{ height: SLOT_HEIGHT }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map(d => {
          const list = (sesionesByDay.get(format(d, "yyyy-MM-dd")) ?? [])
            .slice().sort((a, b) => +new Date(a.fechaSesion) - +new Date(b.fechaSesion));
          return (
            <div key={+d} className="relative border-r last:border-r-0 border-slate-200">
              {HOURS.map(h => (
                <div
                  key={h}
                  className="border-b border-slate-100 hover:bg-teal-50/40 cursor-pointer"
                  style={{ height: SLOT_HEIGHT }}
                  onClick={() => {
                    const dt = new Date(d);
                    dt.setHours(h, 0, 0, 0);
                    openCreateSesion(dt);
                  }}
                />
              ))}
              {list.map(s => {
                const sd = new Date(s.fechaSesion);
                const top = (getHours(sd) - HOUR_START) * SLOT_HEIGHT + (getMinutes(sd) / 60) * SLOT_HEIGHT;
                const height = Math.max(SLOT_HEIGHT * 0.8, 36);
                if (top < 0 || top >= (HOUR_END - HOUR_START) * SLOT_HEIGHT) return null;
                return (
                  <div key={s.id} className="absolute left-0.5 right-0.5" style={{ top, height }}>
                    {renderEventCard(s, true)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // Month view
  const renderMonthView = () => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const weekdayHeaders = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white/60">
        <div className="grid grid-cols-7 bg-slate-50/60 border-b border-slate-200">
          {weekdayHeaders.map(d => (
            <div key={d} className="text-[10px] uppercase tracking-wide text-slate-500 text-center py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[100px]">
          {days.map(d => {
            const inMonth = isSameMonth(d, cursor);
            const isToday = isSameDay(d, new Date());
            const list = (sesionesByDay.get(format(d, "yyyy-MM-dd")) ?? [])
              .slice().sort((a, b) => +new Date(a.fechaSesion) - +new Date(b.fechaSesion));
            return (
              <div
                key={+d}
                onClick={() => {
                  setCursor(d);
                  setViewMode("day");
                }}
                className={`border-r border-b border-slate-100 p-1.5 text-xs cursor-pointer hover:bg-teal-50/40 transition-colors ${inMonth ? "" : "bg-slate-50/40 text-slate-400"}`}
              >
                <div className={`text-right text-[11px] font-semibold mb-1 ${isToday ? "text-teal-700" : ""}`}>
                  {format(d, "d")}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {list.slice(0, 3).map(s => (
                    <div key={s.id} className={`flex items-center gap-1 truncate text-[10px] px-1 py-0.5 rounded ${estadoConfig[s.estadoPago].soft}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${estadoConfig[s.estadoPago].dot}`} />
                      <span className="truncate">{format(new Date(s.fechaSesion), "HH:mm")} {s.pacienteName}</span>
                    </div>
                  ))}
                  {list.length > 3 && (
                    <div className="text-[10px] text-slate-500 px-1">+{list.length - 3} más</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────
  const kpis = clinica?.kpis;

  return (
    <div className="space-y-6">
      {/* Header / toolbar */}
      <div className="glass-panel rounded-2xl p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-teal-600" />
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground">Portal Agenda</h2>
              <p className="text-xs text-muted-foreground">Calendario de sesiones, tarifas y reportes del centro.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="rounded-full"
              onClick={() => setTarifasOpen(true)}>
              <Wallet className="w-4 h-4 mr-1.5" /> Tarifas
            </Button>
            <Button size="sm" className="rounded-full bg-teal-600 hover:bg-teal-700"
              onClick={() => openCreateSesion()}>
              <Plus className="w-4 h-4 mr-1.5" /> Nueva sesión
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Sesiones</span>
            <CalendarDays className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-semibold text-slate-800">{kpis?.totalSesiones ?? 0}</div>
          <div className="text-[11px] text-slate-500 mt-1">en el periodo</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Recaudado</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-semibold text-emerald-700">{fmtMoney(kpis?.totalRecaudado ?? 0)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{kpis?.sesionesPagadas ?? 0} pagadas</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Pendiente</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-semibold text-amber-700">{fmtMoney(kpis?.totalPendiente ?? 0)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{kpis?.sesionesPendientes ?? 0} pendientes</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Deuda</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-semibold text-rose-700">{fmtMoney(kpis?.totalDeuda ?? 0)}</div>
          <div className="text-[11px] text-slate-500 mt-1">{kpis?.sesionesDeuda ?? 0} en deuda</div>
        </div>
      </div>

      {/* Calendar toolbar + grid */}
      <div className="glass-panel rounded-2xl p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full h-8 w-8 p-0" onClick={() => navigate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="rounded-full h-8" onClick={() => navigate(0)}>
              Hoy
            </Button>
            <Button variant="outline" size="sm" className="rounded-full h-8 w-8 p-0" onClick={() => navigate(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="ml-2 text-sm font-medium text-slate-700 capitalize">{periodLabel}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterPsicologo} onValueChange={setFilterPsicologo}>
              <SelectTrigger className="rounded-full h-8 w-[180px] text-xs"><SelectValue placeholder="Psicólogo" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos los psicólogos</SelectItem>
                {psicologos.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="rounded-full h-8 w-[140px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pagado">Pagado</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="deuda">Deuda</SelectItem>
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5">
              {(["day", "week", "month"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${viewMode === v ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {v === "day" ? "Día" : v === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loadingSesiones ? (
          <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
        ) : (
          <>
            {viewMode === "day" && renderDayView()}
            {viewMode === "week" && renderWeekView()}
            {viewMode === "month" && renderMonthView()}
          </>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pagado</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Pendiente</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Deuda</div>
          <div className="ml-auto text-[11px] text-slate-500">Click en un horario libre para crear una sesión, o en una sesión para editarla.</div>
        </div>
      </div>

      {/* Reports */}
      <div className="glass-panel rounded-2xl p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-teal-600" />
          <h3 className="font-semibold text-slate-800">Reportes</h3>
        </div>
        <Tabs defaultValue="paciente" className="w-full">
          <TabsList className="rounded-full bg-slate-100 p-1">
            <TabsTrigger value="paciente" className="rounded-full text-xs"><Users className="w-3.5 h-3.5 mr-1" /> Por paciente</TabsTrigger>
            <TabsTrigger value="psicologo" className="rounded-full text-xs"><BrainCircuit className="w-3.5 h-3.5 mr-1" /> Por psicólogo</TabsTrigger>
            <TabsTrigger value="clinica" className="rounded-full text-xs"><TrendingUp className="w-3.5 h-3.5 mr-1" /> Clínica</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="outline" className="rounded-full"
                onClick={() => exportCSV(repPacientes as unknown as Record<string, unknown>[], `agenda_pacientes_${format(new Date(), "yyyy-MM-dd")}.csv`)}>
                <FileText className="w-4 h-4 mr-1.5" /> Exportar CSV
              </Button>
            </div>
            {repPacientes.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">Sin datos</p>
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
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {r.pacienteName}
                          <div className="text-xs text-slate-500">{r.pacienteEmail}</div>
                        </td>
                        <td className="py-2 px-3 text-right">{r.totalSesiones}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">{fmtMoney(r.totalRecaudado)}</td>
                        <td className="py-2 px-3 text-right text-amber-700">{fmtMoney(r.totalPendiente)}</td>
                        <td className="py-2 px-3 text-right text-rose-700">{fmtMoney(r.totalDeuda)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{fmtMoney(r.totalGeneral)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="psicologo" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button size="sm" variant="outline" className="rounded-full"
                onClick={() => exportCSV(repPsicologos as unknown as Record<string, unknown>[], `agenda_psicologos_${format(new Date(), "yyyy-MM-dd")}.csv`)}>
                <FileText className="w-4 h-4 mr-1.5" /> Exportar CSV
              </Button>
            </div>
            {repPsicologos.length === 0 ? (
              <p className="text-center text-slate-500 py-8 text-sm">Sin datos</p>
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
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {r.psicologoName}
                          <div className="text-xs text-slate-500">{r.psicologoEmail}</div>
                        </td>
                        <td className="py-2 px-3 text-right">{r.totalSesiones}</td>
                        <td className="py-2 px-3 text-right text-emerald-700">{fmtMoney(r.totalRecaudado)}</td>
                        <td className="py-2 px-3 text-right">{r.comisionPct.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right">{fmtMoney(r.comisionCalculada)}</td>
                        <td className="py-2 px-3 text-right font-semibold">{fmtMoney(r.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="clinica" className="mt-4">
            {!clinica?.monthly?.length ? (
              <p className="text-center text-slate-500 py-8 text-sm">Sin datos</p>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <Button size="sm" variant="outline" className="rounded-full"
                    onClick={() => exportCSV(clinica.monthly as unknown as Record<string, unknown>[], `agenda_clinica_mensual_${format(new Date(), "yyyy-MM-dd")}.csv`)}>
                    <FileText className="w-4 h-4 mr-1.5" /> Exportar CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 font-medium">Mes</th>
                        <th className="py-2 px-3 font-medium text-right">Sesiones</th>
                        <th className="py-2 px-3 font-medium text-right">Recaudado</th>
                        <th className="py-2 px-3 font-medium text-right">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clinica.monthly.map(m => (
                        <tr key={m.mes} className="border-b border-slate-100">
                          <td className="py-2 px-3 font-medium">{m.mes}</td>
                          <td className="py-2 px-3 text-right">{m.sesiones}</td>
                          <td className="py-2 px-3 text-right text-emerald-700">{fmtMoney(m.recaudado)}</td>
                          <td className="py-2 px-3 text-right text-amber-700">{fmtMoney(m.pendiente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Sesion modal ──────────────────────────────────────────────── */}
      <Dialog open={sesionModalOpen} onOpenChange={setSesionModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingSesion ? "Editar sesión" : "Nueva sesión"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Paciente</Label>
                <Select value={sesionForm.pacienteId} onValueChange={v => setSesionForm(f => ({ ...f, pacienteId: v }))}>
                  <SelectTrigger className="rounded-lg"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent className="max-h-72">
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
                  <SelectContent className="max-h-72">
                    {psicologos.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha y hora</Label>
                <Input type="datetime-local" value={sesionForm.fechaSesion}
                  onChange={e => setSesionForm(f => ({ ...f, fechaSesion: e.target.value }))} className="rounded-lg" />
              </div>
              <div>
                <Label>Monto (opcional, usa tarifa)</Label>
                <Input type="number" step="0.01" min="0" value={sesionForm.montoCobrado}
                  onChange={e => setSesionForm(f => ({ ...f, montoCobrado: e.target.value }))} className="rounded-lg" />
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
                    <SelectItem value="deuda">Deuda</SelectItem>
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
              <Input value={sesionForm.notas} onChange={e => setSesionForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Comentarios adicionales" className="rounded-lg" />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            {editingSesion && (
              <>
                <Button variant="outline" className="rounded-full sm:mr-auto text-rose-600 hover:bg-rose-50"
                  onClick={() => { setSesionToDelete(editingSesion); setSesionModalOpen(false); }}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar
                </Button>
                {editingSesion.estadoPago !== "pagado" && (
                  <Button variant="outline" className="rounded-full text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    onClick={() => { markPaidMut.mutate(editingSesion.id); setSesionModalOpen(false); }}>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Marcar pagada
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" className="rounded-full" onClick={() => setSesionModalOpen(false)}>Cancelar</Button>
            <Button className="rounded-full bg-teal-600 hover:bg-teal-700"
              onClick={() => saveSesionMut.mutate()}
              disabled={!sesionForm.pacienteId || !sesionForm.psicologoId || !sesionForm.fechaSesion || saveSesionMut.isPending}>
              {saveSesionMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tarifas list/management dialog ─────────────────────────────── */}
      <Dialog open={tarifasOpen} onOpenChange={setTarifasOpen}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tarifas por paciente</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="flex justify-end mb-3">
              <Button size="sm" className="rounded-full bg-teal-600 hover:bg-teal-700"
                onClick={() => { setTarifaForm({ pacienteId: "", monto: "", moneda: "PEN" }); setTarifaModalOpen(true); }}>
                <Plus className="w-4 h-4 mr-1.5" /> Nueva tarifa
              </Button>
            </div>
            {loadingTarifas ? (
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mx-auto" />
            ) : tarifas.length === 0 ? (
              <p className="text-center text-slate-500 py-6 text-sm">Aún no hay tarifas registradas.</p>
            ) : (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500 border-b border-slate-200 sticky top-0 bg-white">
                    <tr>
                      <th className="py-2 px-3 font-medium">Paciente</th>
                      <th className="py-2 px-3 font-medium text-right">Monto</th>
                      <th className="py-2 px-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tarifas.map(t => (
                      <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {t.pacienteName}
                          <div className="text-xs text-slate-500">{t.pacienteEmail}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">{fmtMoney(t.montoPorSesion, t.moneda)}</td>
                        <td className="py-2 px-3 text-right">
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
        </DialogContent>
      </Dialog>

      {/* ─── Tarifa create/edit modal ──────────────────────────────────── */}
      <Dialog open={tarifaModalOpen} onOpenChange={setTarifaModalOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {tarifaForm.pacienteId && tarifas.find(t => t.pacienteId === parseInt(tarifaForm.pacienteId))
                ? "Editar tarifa"
                : "Nueva tarifa"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Paciente</Label>
              <Select value={tarifaForm.pacienteId} onValueChange={v => setTarifaForm(f => ({ ...f, pacienteId: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Seleccionar paciente" /></SelectTrigger>
                <SelectContent className="max-h-72">
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

      {/* ─── Confirm delete tarifa ────────────────────────────────────── */}
      <AlertDialog open={!!tarifaToDelete} onOpenChange={o => !o && setTarifaToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la tarifa de <strong>{tarifaToDelete?.pacienteName}</strong>. Las sesiones ya registradas conservan su monto.
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

      {/* ─── Confirm delete sesion ─────────────────────────────────────── */}
      <AlertDialog open={!!sesionToDelete} onOpenChange={o => !o && setSesionToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar sesión?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la sesión de <strong>{sesionToDelete?.pacienteName}</strong> del{" "}
              {sesionToDelete && format(parseISO(sesionToDelete.fechaSesion), "d MMM yyyy, HH:mm", { locale: es })}.
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

