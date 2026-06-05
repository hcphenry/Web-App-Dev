import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Loader2, Pencil, Trash2, Check, X,
  History as HistoryIcon, Circle as CircleIcon, Clock as ClockIcon,
  AlertTriangle, Sparkles, ChevronDown, ChevronUp, BarChart3, TrendingUp,
  Maximize2,
} from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

// ── Paleta "Positivamente" ─────────────────────────────────────────────────
const PALETTE = {
  oliva:   "#ABAE84",
  azul:    "#AEC8D2",
  mostaza: "#D4AE7F",
  crema:   "#F2EADF",
  rosa:    "#EBC1BC",
  tinta:   "#333333",
};

interface SubItem { label: string; key: string }
interface Area {
  key: string;
  numero: string;
  titulo: string;
  resumen: string;
  pregunta: string;
  acento: string;
  subitems: SubItem[];
}

const AREAS: Area[] = [
  {
    key: "salud-mental-bienestar",
    numero: "1",
    titulo: "Salud mental y bienestar emocional",
    resumen: "Cómo gestionas emociones, estrés, diálogo interno y retos diarios.",
    pregunta: "¿Qué tan satisfecha/o estás hoy con tu salud mental?",
    acento: PALETTE.rosa,
    subitems: [
      { key: "gestion-emociones", label: "Gestión de las emociones" },
      { key: "nivel-estres", label: "Nivel de estrés" },
      { key: "dialogo-interno", label: "Diálogo interno (cómo te hablas)" },
      { key: "afrontar-retos", label: "Capacidad para afrontar retos diarios" },
    ],
  },
  {
    key: "salud-energia-fisica",
    numero: "2",
    titulo: "Salud: Energía física",
    resumen: "Condición física, energía, sueño, ejercicio, alimentación y autocuidado.",
    pregunta: "¿Cómo calificas tu salud física y energía en general?",
    acento: PALETTE.oliva,
    subitems: [
      { key: "condicion-fisica", label: "Condición física general" },
      { key: "energia", label: "Energía" },
      { key: "habitos-sueno", label: "Hábitos de sueño" },
      { key: "rutina-ejercicio", label: "Rutina de ejercicio regular" },
      { key: "alimentacion", label: "Alimentación balanceada" },
      { key: "autocuidado", label: "Autocuidado" },
    ],
  },
  {
    key: "carrera-profesion",
    numero: "3",
    titulo: "Carrera / Profesión",
    resumen: "Satisfacción laboral, propósito, desarrollo, reconocimiento y emprendimiento.",
    pregunta: "¿Qué tan satisfecha/o estás con tu carrera o profesión?",
    acento: PALETTE.mostaza,
    subitems: [
      { key: "satisfaccion-laboral", label: "Satisfacción laboral y propósito" },
      { key: "desarrollo-habilidades", label: "Desarrollo de habilidades profesionales" },
      { key: "oportunidades-crecimiento", label: "Oportunidades de crecimiento" },
      { key: "reconocimiento-logros", label: "Reconocimiento y logros" },
      { key: "emprendimiento", label: "Emprendimiento e innovación" },
    ],
  },
  {
    key: "finanzas",
    numero: "4",
    titulo: "Finanzas",
    resumen: "Manejo del dinero, ahorro, deudas, planificación y libertad económica.",
    pregunta: "¿Cómo te sientes con tu situación financiera actual?",
    acento: PALETTE.azul,
    subitems: [
      { key: "ingresos", label: "Ingresos estables y suficientes" },
      { key: "ahorro", label: "Capacidad de ahorro" },
      { key: "deudas", label: "Gestión de deudas" },
      { key: "planificacion-futuro", label: "Planificación financiera a futuro" },
      { key: "libertad-economica", label: "Libertad económica personal" },
    ],
  },
  {
    key: "relaciones-amigos",
    numero: "5",
    titulo: "Relaciones / Amigos",
    resumen: "Calidad de tus amistades, apoyo social, confianza y comunidad.",
    pregunta: "¿Qué tan satisfecha/o estás con tus relaciones y amistades?",
    acento: PALETTE.rosa,
    subitems: [
      { key: "calidad-amistades", label: "Calidad de tus amistades" },
      { key: "apoyo-social", label: "Apoyo social en momentos difíciles" },
      { key: "confianza", label: "Confianza" },
      { key: "actividades-grupales", label: "Actividades grupales y comunidad" },
      { key: "influencia-positiva", label: "Influencia positiva del entorno" },
      { key: "tiempo-socializar", label: "Tiempo que dedicas a socializar" },
    ],
  },
  {
    key: "familia",
    numero: "6",
    titulo: "Familia",
    resumen: "Calidad del tiempo y comunicación con tus seres queridos.",
    pregunta: "¿Cómo describirías la calidad de tu vida familiar?",
    acento: PALETTE.oliva,
    subitems: [
      { key: "calidad-relacion-familia", label: "Calidad de la relación familiar" },
      { key: "comunicacion-familia", label: "Comunicación" },
      { key: "limites", label: "Límites" },
      { key: "tiempo-compartido", label: "Tiempo compartido con el entorno familiar" },
    ],
  },
  {
    key: "amor-pareja",
    numero: "7",
    titulo: "Amor / Pareja",
    resumen: "Intimidad, comunicación, apoyo mutuo y tiempo de calidad.",
    pregunta: "¿Qué tan satisfecha/o te sientes con tu vida amorosa o de pareja?",
    acento: PALETTE.mostaza,
    subitems: [
      { key: "calidad-pareja", label: "Calidad de la relación de pareja" },
      { key: "vinculos-solidos", label: "Vínculos familiares sólidos" },
      { key: "comunicacion-pareja", label: "Comunicación efectiva" },
      { key: "apoyo-mutuo", label: "Apoyo mutuo y comprensión" },
      { key: "tiempo-calidad", label: "Tiempo de calidad compartido" },
    ],
  },
  {
    key: "ocio-diversion",
    numero: "8",
    titulo: "Ocio / Diversión",
    resumen: "Hobbies, viajes, diversión, creatividad y tiempo libre.",
    pregunta: "¿Cómo calificas el tiempo que dedicas a disfrutar?",
    acento: PALETTE.azul,
    subitems: [
      { key: "hobbies", label: "Hobbies y actividades placenteras" },
      { key: "viajes-experiencias", label: "Viajes y nuevas experiencias" },
      { key: "diversion", label: "Diversión y momentos de alegría" },
      { key: "creatividad", label: "Actividades creativas y artísticas" },
      { key: "tiempo-libre", label: "Tiempo libre bien aprovechado" },
    ],
  },
  {
    key: "desarrollo-personal",
    numero: "9",
    titulo: "Desarrollo Personal",
    resumen: "Aprendizaje continuo, hábitos y autoconocimiento.",
    pregunta: "¿Qué tanto estás creciendo personalmente?",
    acento: PALETTE.rosa,
    subitems: [
      { key: "lectura-aprendizaje", label: "Lectura y aprendizaje constante" },
      { key: "nuevas-habilidades", label: "Desarrollo de nuevas habilidades" },
      { key: "habitos-positivos", label: "Formación de hábitos positivos" },
      { key: "autoconocimiento", label: "Trabajo de autoconocimiento" },
      { key: "capacitacion", label: "Capacitación y cursos especializados" },
    ],
  },
  {
    key: "entorno-fisico",
    numero: "10",
    titulo: "Entorno Físico",
    resumen: "Tu hogar y el lugar donde vives.",
    pregunta: "¿Qué tan satisfecha/o estás con tu hogar y entorno?",
    acento: PALETTE.mostaza,
    subitems: [
      { key: "hogar", label: "Confort de tu hogar" },
      { key: "barrio", label: "Tu barrio o lugar donde vives" },
      { key: "orden-limpieza", label: "Orden y limpieza" },
    ],
  },
];

const AREA_BY_KEY = new Map(AREAS.map(a => [a.key, a] as const));

interface ItemSub { label: string; score: number }
interface ItemValue { key: string; score: number; subitems?: ItemSub[] }

interface Record {
  id: number;
  pacienteId: number;
  assignmentId: number | null;
  items: ItemValue[];
  accionSemillaArea: string | null;
  accionSemilla: string | null;
  accionSemillaFecha: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit?: boolean;
}

interface Props {
  assignmentId?: number | null;
  /** Si está definido, el formulario lo llena un psicólogo/admin PARA el paciente indicado. */
  psiPacienteId?: number;
  /** Registro existente para editar/precargar en modo psi (presente -> edición). */
  psiRecord?: any | null;
  onCancel: () => void;
  onSaved: () => void;
}

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function hoursLeft(createdAt: string): number {
  const left = EDIT_WINDOW_MS - (Date.now() - new Date(createdAt).getTime());
  return Math.max(0, Math.floor(left / (60 * 60 * 1000)));
}

function areaScoreFromSubs(subs: { [k: string]: number }, area: Area): number {
  const vals = area.subitems.map(s => subs[s.key] ?? 0);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function radarDataFromItems(items: ItemValue[]) {
  const map = new Map(items.map(it => [it.key, it.score]));
  return AREAS.map(a => ({
    area: a.titulo,
    short: a.numero,
    score: map.get(a.key) ?? 0,
    fullMark: 10,
  }));
}

export default function RuedaVidaForm({ assignmentId, psiPacienteId, psiRecord, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const psiMode = psiPacienteId != null;

  const subValuesFromRecord = (rec: any): { [areaKey: string]: { [subKey: string]: number } } => {
    const next: { [k: string]: { [k: string]: number } } = {};
    for (const a of AREAS) {
      const recItem = rec?.items?.find((it: any) => it.key === a.key);
      const subMap: { [k: string]: number } = {};
      const recSubs = recItem?.subitems ?? [];
      const subByLabel = new Map(recSubs.map((s: any) => [s.label, s.score]));
      for (const s of a.subitems) {
        const v = subByLabel.get(s.label) as number | undefined;
        subMap[s.key] = v ?? recItem?.score ?? 5;
      }
      next[a.key] = subMap;
    }
    return next;
  };

  const [view, setView] = useState<"history" | "form">(psiMode ? "form" : "history");
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(psiMode ? (psiRecord?.id ?? null) : null);
  const [expanded, setExpanded] = useState<{ [k: string]: boolean }>({});
  const [chartFullId, setChartFullId] = useState<number | null>(null);
  const [showEvolution, setShowEvolution] = useState(false);

  // Estado de los sub-ítems por área (key = `${areaKey}.${subKey}`) y notas.
  const [subValues, setSubValues] = useState<{ [areaKey: string]: { [subKey: string]: number } }>(
    () => psiMode && psiRecord
      ? subValuesFromRecord(psiRecord)
      : Object.fromEntries(AREAS.map(a => [a.key, Object.fromEntries(a.subitems.map(s => [s.key, 5]))])),
  );
  const [notas, setNotas] = useState<string>(psiMode ? (psiRecord?.notas ?? "") : "");
  const [accionArea, setAccionArea] = useState<string>(psiMode ? (psiRecord?.accionSemillaArea ?? "") : "");
  const [accionTexto, setAccionTexto] = useState<string>(psiMode ? (psiRecord?.accionSemilla ?? "") : "");
  const [accionFecha, setAccionFecha] = useState<string>(psiMode ? (psiRecord?.accionSemillaFecha ?? "") : "");

  const refresh = async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/rueda-vida/mine", { credentials: "include" });
      if (r.ok) setRecords(await r.json());
      else setRecords([]);
    } catch { setRecords([]); }
    setLoadingList(false);
  };

  useEffect(() => {
    if (psiMode) { setLoadingList(false); return; }
    void refresh();
  }, []);

  const resetForm = () => {
    setSubValues(Object.fromEntries(AREAS.map(a => [a.key, Object.fromEntries(a.subitems.map(s => [s.key, 5]))])));
    setNotas("");
    setAccionArea("");
    setAccionTexto("");
    setAccionFecha("");
    setExpanded({});
  };

  const startNew = () => {
    setEditingId(null);
    resetForm();
    setView("form");
  };

  const startEdit = (rec: Record) => {
    setEditingId(rec.id);
    // Carga los sub-valores conocidos; si un área venía sólo con score promedio,
    // inicializa todos sus sub-ítems con ese mismo score para que el edit refleje el valor.
    const next: { [k: string]: { [k: string]: number } } = {};
    for (const a of AREAS) {
      const recItem = rec.items?.find(it => it.key === a.key);
      const subMap: { [k: string]: number } = {};
      const recSubs = recItem?.subitems ?? [];
      const subByLabel = new Map(recSubs.map(s => [s.label, s.score]));
      for (const s of a.subitems) {
        const v = subByLabel.get(s.label);
        subMap[s.key] = v ?? recItem?.score ?? 5;
      }
      next[a.key] = subMap;
    }
    setSubValues(next);
    setNotas(rec.notas ?? "");
    setAccionArea(rec.accionSemillaArea ?? "");
    setAccionTexto(rec.accionSemilla ?? "");
    setAccionFecha(rec.accionSemillaFecha ?? "");
    setView("form");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = AREAS.map(a => {
        const subs = subValues[a.key] ?? {};
        return {
          key: a.key,
          score: areaScoreFromSubs(subs, a),
          subitems: a.subitems.map(s => ({ label: s.label, score: subs[s.key] ?? 0 })),
        };
      });
      const baseBody: any = {
        items,
        notas: notas || null,
        accionSemillaArea: accionArea || null,
        accionSemilla: accionTexto || null,
        accionSemillaFecha: accionFecha || null,
      };
      if (psiMode) {
        const isEditPsi = !!psiRecord?.id;
        const url = isEditPsi
          ? `/api/rueda-vida/psi/${psiRecord.id}`
          : `/api/rueda-vida/psi/for-patient/${psiPacienteId}`;
        const method = isEditPsi ? "PATCH" : "POST";
        const r = await fetch(url, {
          method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(baseBody),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "No se pudo guardar");
        toast({ title: "Registro guardado" });
        onSaved();
        return;
      }
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/rueda-vida/${editingId}` : "/api/rueda-vida/mine";
      const method = isEdit ? "PATCH" : "POST";
      const body: any = { ...baseBody };
      if (!isEdit && assignmentId) body.assignmentId = assignmentId;

      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "No se pudo guardar");
      toast({
        title: isEdit ? "Rueda actualizada" : "¡Rueda guardada!",
        description: isEdit
          ? "Tus cambios fueron almacenados."
          : "Tu rueda de la vida quedó registrada.",
      });
      qc.invalidateQueries({ queryKey: ["mine-tasks"] });
      await refresh();
      setView("history");
      if (!isEdit) onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Intenta nuevamente." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec: Record) => {
    if (!confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
    try {
      const r = await fetch(`/api/rueda-vida/${rec.id}`, { method: "DELETE", credentials: "include" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "No se pudo eliminar");
      toast({ title: "Registro eliminado" });
      await refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Intenta nuevamente." });
    }
  };

  // Promedio total visible mientras el paciente llena el formulario.
  const totalPromedio = useMemo(() => {
    const scores = AREAS.map(a => areaScoreFromSubs(subValues[a.key] ?? {}, a));
    if (!scores.length) return 0;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }, [subValues]);

  const currentRadarData = useMemo(() => {
    return AREAS.map(a => ({
      area: a.titulo,
      short: a.numero,
      score: areaScoreFromSubs(subValues[a.key] ?? {}, a),
      fullMark: 10,
    }));
  }, [subValues]);

  // Datos para la línea evolutiva (todos los registros) — promedio por fecha.
  const evolutionData = useMemo(() => {
    return [...records]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(rec => {
        const vals = (rec.items ?? []).map(it => it.score);
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        return {
          fecha: format(new Date(rec.createdAt), "d MMM", { locale: es }),
          promedio: Math.round(avg * 10) / 10,
        };
      });
  }, [records]);

  const fullRecord = chartFullId !== null ? records.find(r => r.id === chartFullId) ?? null : null;

  // ── HISTORIAL ─────────────────────────────────────────────────────────────
  if (view === "history") {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div
          className="rounded-2xl p-6 border shadow-sm"
          style={{ background: `linear-gradient(135deg, ${PALETTE.crema} 0%, #FFFFFF 100%)`, borderColor: PALETTE.azul + "55" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: `linear-gradient(135deg, ${PALETTE.oliva}, ${PALETTE.azul})` }}
            >
              <CircleIcon className="w-7 h-7" style={{ color: PALETTE.tinta }} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-display font-semibold" style={{ color: PALETTE.tinta }}>
                La Rueda de la Vida
              </h2>
              <p className="text-sm mt-1" style={{ color: PALETTE.tinta + "B0" }}>
                Evalúa tu nivel de satisfacción en 10 áreas clave (del 0 al 10), visualiza tu equilibrio en una rueda y elige una acción semilla para mejorar. Puedes repetir el ejercicio cuantas veces quieras y comparar tu evolución en el tiempo.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full" style={{ background: PALETTE.azul + "55", color: PALETTE.tinta }}>
                <ClockIcon className="w-3.5 h-3.5" />
                Podrás editar o eliminar cada registro durante 48 horas después de guardarlo.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-5">
            <Button onClick={startNew} className="rounded-full shadow-sm" style={{ background: PALETTE.tinta, color: "white" }}>
              <Sparkles className="w-4 h-4 mr-2" /> Nueva rueda
            </Button>
            {records.length >= 2 && (
              <Button onClick={() => setShowEvolution(s => !s)} variant="outline" className="rounded-full">
                <TrendingUp className="w-4 h-4 mr-2" /> {showEvolution ? "Ocultar" : "Ver"} evolución
              </Button>
            )}
            <Button onClick={onCancel} variant="outline" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver
            </Button>
          </div>
        </div>

        {showEvolution && evolutionData.length >= 2 && (
          <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: PALETTE.azul + "66" }}>
            <h3 className="text-base font-display font-semibold mb-3 flex items-center gap-2" style={{ color: PALETTE.tinta }}>
              <TrendingUp className="w-4 h-4" /> Evolución del promedio general
            </h3>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={evolutionData} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
                  <XAxis dataKey="fecha" stroke={PALETTE.tinta} fontSize={12} />
                  <YAxis domain={[0, 10]} stroke={PALETTE.tinta} fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="promedio" stroke={PALETTE.oliva} strokeWidth={3} dot={{ r: 4, fill: PALETTE.mostaza }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2" style={{ color: PALETTE.tinta }}>
            <HistoryIcon className="w-5 h-5" /> Historial
          </h3>
          {loadingList ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: PALETTE.tinta }} /></div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: PALETTE.azul + "66", background: PALETTE.crema + "55" }}>
              <p style={{ color: PALETTE.tinta + "AA" }}>Aún no has llenado esta tarea. Crea tu primera rueda cuando estés lista/o.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {records.map((rec) => {
                const scores = (rec.items ?? []).map(it => it.score);
                const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
                const editable = rec.canEdit ?? (Date.now() - new Date(rec.createdAt).getTime() < EDIT_WINDOW_MS);
                const left = hoursLeft(rec.createdAt);
                const data = radarDataFromItems(rec.items ?? []);
                return (
                  <div
                    key={rec.id}
                    className="rounded-2xl border p-4 shadow-sm flex flex-col gap-3"
                    style={{ borderColor: PALETTE.azul + "55", background: "white" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white shadow-sm shrink-0"
                        style={{ background: `linear-gradient(135deg, ${PALETTE.oliva}, ${PALETTE.azul})` }}
                      >
                        <span className="text-base font-bold leading-none">{avg}</span>
                        <span className="text-[10px] opacity-80">/10</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: PALETTE.tinta }}>
                          {format(new Date(rec.createdAt), "EEEE d 'de' MMMM, yyyy · HH:mm", { locale: es })}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: PALETTE.tinta + "99" }}>
                          {editable
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: PALETTE.oliva + "44", color: PALETTE.tinta }}>
                                <ClockIcon className="w-3 h-3" /> editable {left}h más
                              </span>
                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#E5E7EB", color: "#6B7280" }}>
                                <AlertTriangle className="w-3 h-3" /> bloqueado (+48h)
                              </span>}
                        </p>
                      </div>
                    </div>

                    <div className="cursor-pointer rounded-xl overflow-hidden" style={{ background: PALETTE.crema + "55" }} onClick={() => setChartFullId(rec.id)} title="Ver más grande">
                      <div style={{ width: "100%", height: 200 }}>
                        <ResponsiveContainer>
                          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
                            <PolarGrid stroke={PALETTE.tinta + "33"} />
                            <PolarAngleAxis dataKey="short" tick={{ fill: PALETTE.tinta, fontSize: 11 }} />
                            <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                            <Radar dataKey="score" stroke={PALETTE.oliva} fill={PALETTE.oliva} fillOpacity={0.45} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {rec.accionSemilla && (
                      <div className="rounded-lg px-3 py-2 text-xs" style={{ background: PALETTE.mostaza + "33", color: PALETTE.tinta }}>
                        <span className="font-semibold">Acción semilla:</span> {rec.accionSemilla}
                        {rec.accionSemillaFecha && <span className="ml-1 opacity-70">· {rec.accionSemillaFecha}</span>}
                      </div>
                    )}

                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setChartFullId(rec.id)} className="rounded-full">
                        <Maximize2 className="w-3.5 h-3.5 mr-1" /> Ampliar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(rec)} disabled={!editable} className="rounded-full">
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Ver / editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(rec)} disabled={!editable}
                        className="rounded-full" style={editable ? { color: "#B91C1C", borderColor: "#FCA5A5" } : undefined}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal con el radar ampliado */}
        <Dialog open={chartFullId !== null} onOpenChange={(v) => { if (!v) setChartFullId(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display" style={{ color: PALETTE.tinta }}>
                <BarChart3 className="w-5 h-5" /> Rueda de la Vida
              </DialogTitle>
              <DialogDescription>
                {fullRecord && format(new Date(fullRecord.createdAt), "EEEE d 'de' MMMM, yyyy · HH:mm", { locale: es })}
              </DialogDescription>
            </DialogHeader>
            {fullRecord && (
              <div className="space-y-4">
                <div style={{ width: "100%", height: 460 }}>
                  <ResponsiveContainer>
                    <RadarChart data={radarDataFromItems(fullRecord.items ?? [])} cx="50%" cy="50%" outerRadius="80%">
                      <PolarGrid stroke={PALETTE.tinta + "33"} />
                      <PolarAngleAxis dataKey="area" tick={{ fill: PALETTE.tinta, fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 10]} tick={{ fill: PALETTE.tinta + "88", fontSize: 10 }} />
                      <Radar dataKey="score" stroke={PALETTE.oliva} fill={PALETTE.oliva} fillOpacity={0.5} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {(fullRecord.items ?? []).map(it => {
                    const a = AREA_BY_KEY.get(it.key);
                    if (!a) return null;
                    return (
                      <div key={it.key} className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: a.acento + "88", background: "white" }}>
                        <span className="text-sm" style={{ color: PALETTE.tinta }}>{a.numero}. {a.titulo}</span>
                        <span className="font-bold" style={{ color: PALETTE.tinta }}>{it.score}/10</span>
                      </div>
                    );
                  })}
                </div>
                {fullRecord.accionSemilla && (
                  <div className="rounded-lg border p-3" style={{ borderColor: PALETTE.mostaza + "66", background: PALETTE.crema + "66" }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.tinta + "AA" }}>
                      Acción semilla{fullRecord.accionSemillaArea ? ` · ${AREA_BY_KEY.get(fullRecord.accionSemillaArea)?.titulo ?? ""}` : ""}
                    </p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: PALETTE.tinta }}>{fullRecord.accionSemilla}</p>
                    {fullRecord.accionSemillaFecha && (
                      <p className="text-xs mt-1" style={{ color: PALETTE.tinta + "99" }}>Fecha objetivo: {fullRecord.accionSemillaFecha}</p>
                    )}
                  </div>
                )}
                {fullRecord.notas && (
                  <div className="rounded-lg border p-3" style={{ borderColor: PALETTE.azul + "66", background: "white" }}>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.tinta + "AA" }}>Notas</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: PALETTE.tinta }}>{fullRecord.notas}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── FORMULARIO ────────────────────────────────────────────────────────────
  const isEdit = editingId !== null;
  const editingRec = isEdit ? records.find(r => r.id === editingId) : null;
  const editLocked = !!(editingRec && !(editingRec.canEdit ?? (Date.now() - new Date(editingRec.createdAt).getTime() < EDIT_WINDOW_MS)));

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div
        className="rounded-2xl p-5 border flex flex-wrap items-center justify-between gap-4 shadow-sm"
        style={{ background: PALETTE.crema, borderColor: PALETTE.mostaza + "66" }}
      >
        <div>
          <h2 className="text-lg font-display font-semibold" style={{ color: PALETTE.tinta }}>
            {isEdit ? "Editar rueda" : "Nueva rueda de la vida"}
          </h2>
          <p className="text-sm" style={{ color: PALETTE.tinta + "AA" }}>
            Califica cada área del 0 (nada satisfecho) al 10 (totalmente satisfecho). Sé honesta/o; este ejercicio es para ti.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="px-3 py-2 rounded-xl text-sm shadow-sm"
            style={{ background: "white", border: `1px solid ${PALETTE.azul}66`, color: PALETTE.tinta }}
          >
            Promedio: <span className="font-semibold">{totalPromedio}</span>/10
          </div>
          <Button variant="outline" onClick={() => setView("history")} className="rounded-full">
            <X className="w-4 h-4 mr-1" /> Cancelar
          </Button>
        </div>
      </div>

      {editLocked && (
        <div className="rounded-xl border p-3 text-sm flex items-center gap-2" style={{ borderColor: "#FECACA", background: "#FEF2F2", color: "#991B1B" }}>
          <AlertTriangle className="w-4 h-4" /> Este registro fue creado hace más de 48 horas y ya no puede modificarse.
        </div>
      )}

      {/* Vista previa de la rueda mientras se llena */}
      <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "white", borderColor: PALETTE.azul + "66" }}>
        <h3 className="text-sm font-display font-semibold mb-2 flex items-center gap-2" style={{ color: PALETTE.tinta }}>
          <CircleIcon className="w-4 h-4" /> Tu rueda en este momento
        </h3>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <RadarChart data={currentRadarData} cx="50%" cy="50%" outerRadius="78%">
              <PolarGrid stroke={PALETTE.tinta + "33"} />
              <PolarAngleAxis dataKey="area" tick={{ fill: PALETTE.tinta, fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 10]} tick={{ fill: PALETTE.tinta + "88", fontSize: 10 }} />
              <Radar dataKey="score" stroke={PALETTE.oliva} fill={PALETTE.oliva} fillOpacity={0.5} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4">
        {AREAS.map((a) => {
          const subs = subValues[a.key] ?? {};
          const score = areaScoreFromSubs(subs, a);
          const isOpen = !!expanded[a.key];
          return (
            <div
              key={a.key}
              className="rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
              style={{ background: "white", borderColor: a.acento + "88", borderLeftWidth: 6, borderLeftColor: a.acento }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold shadow-sm"
                  style={{ background: a.acento, color: PALETTE.tinta }}
                >
                  {a.numero}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="font-display font-semibold text-lg" style={{ color: PALETTE.tinta }}>{a.titulo}</h3>
                    <span className="text-2xl font-bold" style={{ color: PALETTE.tinta }}>{score}<span className="text-base opacity-60">/10</span></span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: PALETTE.tinta + "B0" }}>{a.resumen}</p>
                  <p className="text-xs italic mt-1" style={{ color: PALETTE.tinta + "99" }}>{a.pregunta}</p>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-3 -ml-2 rounded-full text-xs"
                    onClick={() => setExpanded(p => ({ ...p, [a.key]: !p[a.key] }))}
                  >
                    {isOpen
                      ? (<><ChevronUp className="w-3.5 h-3.5 mr-1" /> Ocultar detalle</>)
                      : (<><ChevronDown className="w-3.5 h-3.5 mr-1" /> Detallar por ítem</>)}
                  </Button>

                  {isOpen && (
                    <div className="mt-3 grid gap-3">
                      {a.subitems.map(s => {
                        const v = subs[s.key] ?? 0;
                        return (
                          <div key={s.key} className="rounded-lg border p-3" style={{ borderColor: PALETTE.azul + "44", background: PALETTE.crema + "33" }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm" style={{ color: PALETTE.tinta }}>{s.label}</span>
                              <span className="font-semibold" style={{ color: PALETTE.tinta }}>{v}</span>
                            </div>
                            <Slider
                              value={[v]}
                              onValueChange={(arr) => {
                                const nv = arr[0] ?? 0;
                                setSubValues(prev => ({
                                  ...prev,
                                  [a.key]: { ...(prev[a.key] ?? {}), [s.key]: nv },
                                }));
                              }}
                              min={0} max={10} step={1}
                              disabled={editLocked}
                            />
                          </div>
                        );
                      })}
                      <p className="text-xs" style={{ color: PALETTE.tinta + "88" }}>
                        El puntaje del área se calcula como el promedio de tus respuestas.
                      </p>
                    </div>
                  )}

                  {!isOpen && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs mb-2" style={{ color: PALETTE.tinta + "AA" }}>
                        <span>Nada satisfecho · 0</span>
                        <span>Totalmente · 10</span>
                      </div>
                      <Slider
                        value={[score]}
                        onValueChange={(arr) => {
                          const nv = arr[0] ?? 0;
                          // Aplicar el mismo valor a todos los sub-ítems del área.
                          setSubValues(prev => ({
                            ...prev,
                            [a.key]: Object.fromEntries(a.subitems.map(s => [s.key, nv])),
                          }));
                        }}
                        min={0} max={10} step={1}
                        disabled={editLocked}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Acción semilla */}
      <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: PALETTE.mostaza + "88" }}>
        <h3 className="font-display font-semibold text-base mb-3 flex items-center gap-2" style={{ color: PALETTE.tinta }}>
          <Sparkles className="w-4 h-4" style={{ color: PALETTE.mostaza }} /> Acción semilla
        </h3>
        <p className="text-sm mb-4" style={{ color: PALETTE.tinta + "AA" }}>
          Elige una sola área (idealmente la que más impacto tenga sobre las demás) y comprométete con una acción pequeña, concreta y con fecha.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase tracking-wider" style={{ color: PALETTE.tinta + "99" }}>Área a potenciar</label>
            <Select value={accionArea} onValueChange={setAccionArea} disabled={editLocked}>
              <SelectTrigger className="rounded-xl bg-white mt-1"><SelectValue placeholder="Elige un área" /></SelectTrigger>
              <SelectContent>
                {AREAS.map(a => <SelectItem key={a.key} value={a.key}>{a.numero}. {a.titulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider" style={{ color: PALETTE.tinta + "99" }}>Fecha objetivo</label>
            <Input
              type="date"
              className="rounded-xl bg-white mt-1"
              value={accionFecha}
              onChange={e => setAccionFecha(e.target.value)}
              disabled={editLocked}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs uppercase tracking-wider" style={{ color: PALETTE.tinta + "99" }}>Compromiso concreto</label>
          <Textarea
            value={accionTexto}
            onChange={e => setAccionTexto(e.target.value)}
            placeholder={`Ej.: "Para mejorar mi salud, voy a salir a caminar 30 minutos los lunes y miércoles."`}
            rows={3}
            maxLength={2000}
            disabled={editLocked}
            className="mt-1"
          />
        </div>
      </div>

      <div className="rounded-2xl border p-5 shadow-sm" style={{ background: "white", borderColor: PALETTE.azul + "88" }}>
        <label className="font-display font-semibold text-base block mb-2" style={{ color: PALETTE.tinta }}>
          Notas (opcional)
        </label>
        <Textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="¿Algo que quieras anotar sobre tu equilibrio hoy?"
          rows={3}
          maxLength={4000}
          disabled={editLocked}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => setView("history")} className="rounded-full">Cancelar</Button>
        <Button onClick={handleSave} disabled={saving || editLocked} className="rounded-full shadow-sm"
          style={{ background: PALETTE.tinta, color: "white" }}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</> : <><Check className="w-4 h-4 mr-2" /> {isEdit ? "Guardar cambios" : "Guardar rueda"}</>}
        </Button>
      </div>
    </div>
  );
}
