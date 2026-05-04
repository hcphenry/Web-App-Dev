import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Save, Loader2, Plus, Trash2, Activity,
  Heart, CloudRain, Minus, Sparkles, BookOpen, MapPin, GraduationCap,
  Pencil, Check, X, Lightbulb, Compass,
} from "lucide-react";

interface Props {
  assignmentId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

type Tipo = "positivo" | "negativo" | "neutral";

interface Evento {
  id: string;
  edad: string;
  titulo: string;
  descripcion: string;
  tipo: Tipo;
  emocion: string;
  aprendizaje: string;
}

const TIPO_META: Record<Tipo, { label: string; chip: string; dot: string; ring: string; icon: any }> = {
  positivo: {
    label: "Positivo",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-gradient-to-br from-emerald-400 to-teal-500",
    ring: "ring-emerald-200",
    icon: Heart,
  },
  negativo: {
    label: "Difícil",
    chip: "bg-rose-100 text-rose-700 border-rose-200",
    dot: "bg-gradient-to-br from-rose-400 to-red-500",
    ring: "ring-rose-200",
    icon: CloudRain,
  },
  neutral: {
    label: "Neutro",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
    dot: "bg-gradient-to-br from-slate-300 to-slate-400",
    ring: "ring-slate-200",
    icon: Minus,
  },
};

const EJEMPLOS = [
  { icon: Heart, text: "Nacimiento de un hermano/a" },
  { icon: GraduationCap, text: "Inicio de la escuela / universidad" },
  { icon: MapPin, text: "Mudanza a otra ciudad" },
  { icon: Sparkles, text: "Logros importantes" },
  { icon: CloudRain, text: "Pérdidas o duelos" },
  { icon: BookOpen, text: "Inicio o final de una relación" },
];

const STEPS = [
  { id: "intro", title: "Bienvenida" },
  { id: "presente", title: "Tu presente" },
  { id: "eventos", title: "Tu línea de vida" },
  { id: "reflexion", title: "Reflexión" },
  { id: "resumen", title: "Resumen" },
] as const;

function newEvento(): Evento {
  return {
    id: Math.random().toString(36).slice(2),
    edad: "",
    titulo: "",
    descripcion: "",
    tipo: "neutral",
    emocion: "",
    aprendizaje: "",
  };
}

export default function LineaVidaForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [stepIdx, setStepIdx] = useState(0);
  const [presenteCircunstancias, setPresenteCircunstancias] = useState("");
  const [reflexionPatrones, setReflexionPatrones] = useState("");
  const [fortalezasVitales, setFortalezasVitales] = useState("");
  const [aprendizajesGenerales, setAprendizajesGenerales] = useState("");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Evento>(newEvento());
  const [saving, setSaving] = useState(false);
  const [existingRecordId, setExistingRecordId] = useState<number | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [recordCreatedAt, setRecordCreatedAt] = useState<string | null>(null);

  // Cargar la última línea de vida del paciente. Si existe, hidrata el form
  // en modo edición — el paciente puede agregar/editar/borrar eventos y
  // guardar los cambios en el mismo registro (no se crea uno nuevo).
  useEffect(() => {
    let active = true;
    setLoadingExisting(true);
    fetch("/api/linea-vida/mine", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        if (!active || !Array.isArray(rows) || rows.length === 0) return;
        const latest = rows[0];
        setExistingRecordId(latest.id);
        setRecordCreatedAt(latest.createdAt ?? null);
        setPresenteCircunstancias(latest.presenteCircunstancias ?? "");
        setReflexionPatrones(latest.reflexionPatrones ?? "");
        setFortalezasVitales(latest.fortalezasVitales ?? "");
        setAprendizajesGenerales(latest.aprendizajesGenerales ?? "");
        if (Array.isArray(latest.eventos)) {
          setEventos(latest.eventos.map((e: any) => ({
            id: typeof e.id === "string" ? e.id : Math.random().toString(36).slice(2),
            edad: String(e.edad ?? ""),
            titulo: String(e.titulo ?? ""),
            descripcion: String(e.descripcion ?? ""),
            tipo: (["positivo","negativo","neutral"].includes(e.tipo) ? e.tipo : "neutral") as Tipo,
            emocion: String(e.emocion ?? ""),
            aprendizaje: String(e.aprendizaje ?? ""),
          })));
        }
      })
      .catch(() => { /* noop, comienza vacío */ })
      .finally(() => { if (active) setLoadingExisting(false); });
    return () => { active = false; };
  }, []);

  const sortedEventos = useMemo(() => {
    return [...eventos].sort((a, b) => {
      const ea = parseInt(a.edad);
      const eb = parseInt(b.edad);
      if (Number.isNaN(ea) && Number.isNaN(eb)) return 0;
      if (Number.isNaN(ea)) return 1;
      if (Number.isNaN(eb)) return -1;
      return ea - eb;
    });
  }, [eventos]);

  const step = STEPS[stepIdx];

  const startNewEvent = () => {
    setDraft(newEvento());
    setEditingId("__new__");
  };
  const startEditEvent = (ev: Evento) => {
    setDraft({ ...ev });
    setEditingId(ev.id);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(newEvento());
  };
  const saveDraft = () => {
    if (!draft.titulo.trim()) {
      toast({ title: "Falta el título del evento", variant: "destructive" });
      return;
    }
    if (!draft.edad.trim()) {
      toast({ title: "Indica la edad en la que ocurrió", variant: "destructive" });
      return;
    }
    if (editingId === "__new__") {
      setEventos(prev => [...prev, draft]);
    } else {
      setEventos(prev => prev.map(e => e.id === editingId ? draft : e));
    }
    setEditingId(null);
    setDraft(newEvento());
  };
  const removeEvento = (id: string) => {
    setEventos(prev => prev.filter(e => e.id !== id));
  };

  const canAdvance = (): boolean => {
    if (step.id === "presente") {
      if (!presenteCircunstancias.trim()) {
        toast({ title: "Cuéntanos brevemente el momento presente", variant: "destructive" });
        return false;
      }
    }
    if (step.id === "eventos") {
      if (eventos.length === 0) {
        toast({ title: "Agrega al menos un evento a tu línea de vida", variant: "destructive" });
        return false;
      }
      if (editingId !== null) {
        toast({ title: "Termina de editar el evento actual antes de continuar", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    setStepIdx(i => Math.min(STEPS.length - 1, i + 1));
  };
  const prev = () => setStepIdx(i => Math.max(0, i - 1));

  const handleSave = async () => {
    if (eventos.length === 0) {
      toast({ title: "Agrega al menos un evento", variant: "destructive" });
      setStepIdx(2);
      return;
    }
    setSaving(true);
    try {
      const isEdit = existingRecordId !== null;
      const url = isEdit
        ? `/api/linea-vida/${existingRecordId}`
        : "/api/linea-vida/mine";
      const body: Record<string, unknown> = {
        presenteCircunstancias,
        reflexionPatrones,
        fortalezasVitales,
        aprendizajesGenerales,
        eventos: sortedEventos,
      };
      if (!isEdit) body.assignmentId = assignmentId ?? null;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "No se pudo guardar tu línea de vida");
      }
      const saved = await res.json().catch(() => null);
      if (saved?.id && !isEdit) setExistingRecordId(saved.id);
      toast({
        title: isEdit ? "Cambios guardados" : "¡Línea de vida guardada!",
        description: isEdit
          ? "Tu línea de vida fue actualizada."
          : "Tu psicólogo podrá revisarla contigo.",
      });
      qc.invalidateQueries({ queryKey: ["mine-tasks"] });
      onSaved();
    } catch (e: any) {
      toast({ title: "Error al guardar", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Stats for the timeline visual
  const stats = useMemo(() => ({
    total: eventos.length,
    positivos: eventos.filter(e => e.tipo === "positivo").length,
    negativos: eventos.filter(e => e.tipo === "negativo").length,
    neutrales: eventos.filter(e => e.tipo === "neutral").length,
  }), [eventos]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero */}
      <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-violet-50 via-fuchsia-50 to-pink-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-200">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-violet-700 uppercase tracking-wider">Tarea terapéutica</p>
            <h2 className="text-xl font-display font-semibold text-foreground">Línea de Vida</h2>
            <p className="text-sm text-muted-foreground">Una herramienta para mirar tu historia con perspectiva y descubrir patrones, fortalezas y aprendizajes.</p>
            {existingRecordId !== null && !loadingExisting && (
              <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-medium text-violet-700 bg-white/70 border border-violet-200 px-2.5 py-1 rounded-full">
                <Pencil className="w-3 h-3" />
                Estás editando tu línea de vida{recordCreatedAt ? ` creada el ${new Date(recordCreatedAt).toLocaleDateString("es-PE")}` : ""}. Tus cambios se guardarán sobre la misma versión.
              </div>
            )}
            {loadingExisting && (
              <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando tu línea de vida…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIdx(i)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                i === stepIdx
                  ? "bg-violet-600 text-white shadow"
                  : i < stepIdx
                    ? "bg-violet-100 text-violet-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                i === stepIdx ? "bg-white text-violet-700" : i < stepIdx ? "bg-violet-600 text-white" : "bg-white text-slate-500"
              }`}>{i + 1}</span>
              {s.title}
            </button>
            {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step.id === "intro" && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-6 border space-y-4">
            <h3 className="text-lg font-display font-semibold flex items-center gap-2">
              <Compass className="w-5 h-5 text-violet-600" />
              ¿Qué es una línea de vida?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Es una representación gráfica de tu historia personal: desde el primer recuerdo de tu infancia hasta el momento actual.
              Sirve para identificar los acontecimientos que te han marcado, los patrones emocionales que se repiten, tus fortalezas
              vitales y los aprendizajes que has construido a lo largo del tiempo.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { n: "1", t: "Tu presente", d: "Describe el momento actual y por qué decides hacer esta línea de vida en terapia." },
                { n: "2", t: "Acontecimientos vitales", d: "Marca los eventos significativos: nacimientos, pérdidas, mudanzas, relaciones, etapas." },
                { n: "3", t: "Diferencia experiencias", d: "Identifica cada evento como positivo, difícil o neutro para ver el matiz emocional." },
                { n: "4", t: "Reflexión y análisis", d: "¿Qué patrones se repiten? ¿Qué aprendiste? ¿Cuáles son tus fortalezas vitales?" },
              ].map(p => (
                <div key={p.n} className="p-4 rounded-xl border bg-white/60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-xs font-bold flex items-center justify-center">{p.n}</span>
                    <span className="font-semibold text-foreground">{p.t}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 border bg-violet-50/50">
            <h4 className="font-semibold flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              Ideas para inspirarte
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EJEMPLOS.map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-white/70 rounded-lg px-3 py-2">
                  <Icon className="w-4 h-4 text-violet-500 shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step.id === "presente" && (
        <div className="glass-panel rounded-2xl p-6 border space-y-4">
          <div>
            <h3 className="text-lg font-display font-semibold">Sitúa tu presente</h3>
            <p className="text-sm text-muted-foreground">
              ¿Cómo te encuentras hoy? ¿Qué te llevó a iniciar este proceso terapéutico?
              Este será el extremo derecho de tu línea, el punto desde el cual miras hacia atrás.
            </p>
          </div>
          <div>
            <Label htmlFor="presente">Circunstancias actuales y motivo de hacer esta línea</Label>
            <Textarea
              id="presente"
              value={presenteCircunstancias}
              onChange={e => setPresenteCircunstancias(e.target.value)}
              rows={6}
              placeholder="Ej. En este momento atravieso un cambio importante… Decidí hacer esta línea para entender mejor…"
              data-testid="textarea-presente"
            />
          </div>
        </div>
      )}

      {step.id === "eventos" && (
        <div className="space-y-4">
          {/* Visual timeline preview */}
          <div className="glass-panel rounded-2xl p-6 border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-display font-semibold">Tu línea de vida</h3>
                <p className="text-xs text-muted-foreground">{stats.total} {stats.total === 1 ? "evento" : "eventos"} ·
                  {" "}<span className="text-emerald-600">● {stats.positivos} positivos</span>
                  {" "}<span className="text-rose-600">● {stats.negativos} difíciles</span>
                  {" "}<span className="text-slate-600">● {stats.neutrales} neutros</span>
                </p>
              </div>
              <Button onClick={startNewEvent} size="sm" className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white">
                <Plus className="w-4 h-4 mr-1" /> Agregar evento
              </Button>
            </div>

            {/* Horizontal visual line */}
            <div className="relative py-6 px-2 overflow-x-auto">
              <div className="relative min-w-full">
                <div className="absolute left-0 right-0 top-1/2 h-1 bg-gradient-to-r from-violet-200 via-fuchsia-200 to-pink-200 rounded-full" />
                {/* Birth marker */}
                <div className="relative flex items-center" style={{ minWidth: `${Math.max(8, sortedEventos.length + 2) * 90}px` }}>
                  <div className="flex flex-col items-center" style={{ width: 90 }}>
                    <div className="w-4 h-4 rounded-full bg-slate-300 border-2 border-white shadow z-10" />
                    <span className="text-[10px] text-slate-500 mt-2">Nacimiento</span>
                  </div>
                  {sortedEventos.map((ev) => {
                    const meta = TIPO_META[ev.tipo];
                    return (
                      <div key={ev.id} className="flex flex-col items-center" style={{ width: 90 }}>
                        <button
                          type="button"
                          onClick={() => startEditEvent(ev)}
                          className={`w-5 h-5 rounded-full ${meta.dot} border-2 border-white shadow z-10 ring-2 ${meta.ring} hover:scale-125 transition-transform`}
                          title={ev.titulo}
                        />
                        <span className="text-[10px] font-semibold text-slate-700 mt-2">{ev.edad ? `${ev.edad} a` : "—"}</span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[80px] text-center" title={ev.titulo}>{ev.titulo}</span>
                      </div>
                    );
                  })}
                  <div className="flex flex-col items-center" style={{ width: 90 }}>
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 border-2 border-white shadow z-10" />
                    <span className="text-[10px] font-semibold text-violet-700 mt-2">Hoy</span>
                  </div>
                </div>
              </div>
            </div>

            {sortedEventos.length === 0 && editingId === null && (
              <div className="text-center py-6 border-2 border-dashed border-violet-200 rounded-xl bg-violet-50/30">
                <Activity className="w-8 h-8 text-violet-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 mb-2">Aún no has agregado eventos</p>
                <Button onClick={startNewEvent} size="sm" variant="outline" className="rounded-xl">
                  <Plus className="w-4 h-4 mr-1" /> Agregar tu primer evento
                </Button>
              </div>
            )}
          </div>

          {/* Event editor */}
          {editingId !== null && (
            <div className="glass-panel rounded-2xl p-6 border-2 border-violet-300 bg-violet-50/30 space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Pencil className="w-4 h-4 text-violet-600" />
                {editingId === "__new__" ? "Nuevo evento" : "Editando evento"}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="evt-edad">Edad (años) *</Label>
                  <Input
                    id="evt-edad"
                    type="number"
                    min="0"
                    max="120"
                    value={draft.edad}
                    onChange={e => setDraft(d => ({ ...d, edad: e.target.value }))}
                    placeholder="15"
                    data-testid="input-evento-edad"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="evt-titulo">Título del evento *</Label>
                  <Input
                    id="evt-titulo"
                    value={draft.titulo}
                    onChange={e => setDraft(d => ({ ...d, titulo: e.target.value }))}
                    placeholder="Ej. Mudanza a Lima"
                    data-testid="input-evento-titulo"
                  />
                </div>
              </div>

              <div>
                <Label>Tipo de experiencia</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(Object.keys(TIPO_META) as Tipo[]).map(t => {
                    const meta = TIPO_META[t];
                    const Icon = meta.icon;
                    const active = draft.tipo === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDraft(d => ({ ...d, tipo: t }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                          active ? `${meta.chip} border-2` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="evt-desc">¿Qué pasó? Cuéntalo brevemente</Label>
                <Textarea
                  id="evt-desc"
                  value={draft.descripcion}
                  onChange={e => setDraft(d => ({ ...d, descripcion: e.target.value }))}
                  rows={3}
                  placeholder="Describe el contexto del evento…"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="evt-emo">Emoción asociada</Label>
                  <Input
                    id="evt-emo"
                    value={draft.emocion}
                    onChange={e => setDraft(d => ({ ...d, emocion: e.target.value }))}
                    placeholder="Ej. tristeza, alegría, miedo, alivio…"
                  />
                </div>
                <div>
                  <Label htmlFor="evt-apr">Aprendizaje</Label>
                  <Input
                    id="evt-apr"
                    value={draft.aprendizaje}
                    onChange={e => setDraft(d => ({ ...d, aprendizaje: e.target.value }))}
                    placeholder="¿Qué te dejó esta experiencia?"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={cancelEdit} className="rounded-xl">
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={saveDraft} className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white">
                  <Check className="w-4 h-4 mr-1" /> Guardar evento
                </Button>
              </div>
            </div>
          )}

          {/* Event cards list */}
          {sortedEventos.length > 0 && (
            <div className="space-y-2">
              {sortedEventos.map((ev) => {
                const meta = TIPO_META[ev.tipo];
                const Icon = meta.icon;
                return (
                  <div key={ev.id} className="glass-panel rounded-xl p-4 border flex items-start gap-3 hover:shadow-md transition-shadow">
                    <div className={`w-10 h-10 rounded-xl ${meta.dot} flex items-center justify-center text-white shrink-0`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{ev.edad} años</span>
                        <h4 className="font-semibold text-foreground">{ev.titulo}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span>
                      </div>
                      {ev.descripcion && <p className="text-xs text-muted-foreground mt-1">{ev.descripcion}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs">
                        {ev.emocion && <span className="text-slate-600"><b className="text-slate-700">Emoción:</b> {ev.emocion}</span>}
                        {ev.aprendizaje && <span className="text-slate-600"><b className="text-slate-700">Aprendizaje:</b> {ev.aprendizaje}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditEvent(ev)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEvento(ev.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step.id === "reflexion" && (
        <div className="glass-panel rounded-2xl p-6 border space-y-5">
          <div>
            <h3 className="text-lg font-display font-semibold flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Reflexión y análisis
            </h3>
            <p className="text-sm text-muted-foreground">Mira tu línea completa y respóndete con calma. No hay respuestas correctas — solo las tuyas.</p>
          </div>

          <div>
            <Label htmlFor="ref-pat">¿Qué patrones emocionales se repiten en tu vida?</Label>
            <Textarea
              id="ref-pat"
              value={reflexionPatrones}
              onChange={e => setReflexionPatrones(e.target.value)}
              rows={4}
              placeholder="Ej. Tiendo a alejarme cuando algo me duele… En las pérdidas siento culpa…"
            />
          </div>

          <div>
            <Label htmlFor="ref-fort">¿Cuáles son tus fortalezas vitales?</Label>
            <Textarea
              id="ref-fort"
              value={fortalezasVitales}
              onChange={e => setFortalezasVitales(e.target.value)}
              rows={4}
              placeholder="Ej. Mi capacidad de adaptarme, la red de amigos que cultivé…"
            />
          </div>

          <div>
            <Label htmlFor="ref-apr">Aprendizajes generales que te han sostenido</Label>
            <Textarea
              id="ref-apr"
              value={aprendizajesGenerales}
              onChange={e => setAprendizajesGenerales(e.target.value)}
              rows={4}
              placeholder="Ej. Aprendí que pedir ayuda no es debilidad…"
            />
          </div>
        </div>
      )}

      {step.id === "resumen" && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-violet-50 to-fuchsia-50">
            <h3 className="text-lg font-display font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-600" />
              Tu línea de vida está lista
            </h3>
            <p className="text-sm text-muted-foreground mt-1">Revisa el resumen y guárdala. Tu psicólogo podrá analizarla contigo en sesión.</p>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-white/80 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats.positivos}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Positivos</div>
              </div>
              <div className="bg-white/80 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-rose-600">{stats.negativos}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Difíciles</div>
              </div>
              <div className="bg-white/80 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-slate-600">{stats.neutrales}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Neutros</div>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 border space-y-4">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-1">Tu presente</h4>
              <p className="text-sm text-foreground whitespace-pre-wrap">{presenteCircunstancias || "—"}</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Eventos ({sortedEventos.length})</h4>
              <ol className="space-y-1.5">
                {sortedEventos.map(ev => {
                  const meta = TIPO_META[ev.tipo];
                  return (
                    <li key={ev.id} className="flex items-center gap-2 text-sm">
                      <span className={`w-3 h-3 rounded-full ${meta.dot} shrink-0`} />
                      <span className="text-xs font-bold text-slate-500 w-12 shrink-0">{ev.edad} a</span>
                      <span className="text-foreground truncate">{ev.titulo}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {(reflexionPatrones || fortalezasVitales || aprendizajesGenerales) && (
              <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t">
                {reflexionPatrones && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Patrones</h4>
                    <p className="text-xs text-muted-foreground line-clamp-4">{reflexionPatrones}</p>
                  </div>
                )}
                {fortalezasVitales && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Fortalezas</h4>
                    <p className="text-xs text-muted-foreground line-clamp-4">{fortalezasVitales}</p>
                  </div>
                )}
                {aprendizajesGenerales && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Aprendizajes</h4>
                    <p className="text-xs text-muted-foreground line-clamp-4">{aprendizajesGenerales}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onCancel} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Salir
        </Button>
        <div className="flex gap-2">
          {stepIdx > 0 && (
            <Button variant="outline" onClick={prev} className="rounded-xl">
              Anterior
            </Button>
          )}
          {stepIdx < STEPS.length - 1 ? (
            <Button onClick={next} className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 text-white">
              Siguiente <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || loadingExisting}
              data-testid="btn-save-linea-vida"
              className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {existingRecordId !== null ? "Guardar cambios" : "Guardar línea de vida"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
