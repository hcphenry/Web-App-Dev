import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Save, Loader2, Pencil, Trash2, Check, X,
  History as HistoryIcon, BrainCircuit, Clock as ClockIcon,
  AlertTriangle, Sparkles,
} from "lucide-react";

// ── Paleta "Positivamente" (paleta de colores POSITIVAMENTE.pdf) ────────────
//   Verde-oliva  #ABAE84   Azul pastel   #AEC8D2   Mostaza  #D4AE7F
//   Crema        #F2EADF   Rosa pastel   #EBC1BC   Tinta    #333333
const PALETTE = {
  oliva:   "#ABAE84",
  azul:    "#AEC8D2",
  mostaza: "#D4AE7F",
  crema:   "#F2EADF",
  rosa:    "#EBC1BC",
  tinta:   "#333333",
};

interface Distorsion {
  key: string;
  numero: string;
  titulo: string;
  pregunta: string;
  explicacion: string;
  ejemplo: string;
  acento: string; // hex from palette
}

const DISTORSIONES: Distorsion[] = [
  {
    key: "todo-o-nada",
    numero: "5.1",
    titulo: "Pensamiento del todo o nada",
    pregunta: "¿Sueles ver las situaciones en blanco o negro, sin matices?",
    explicacion: "Categorizar la realidad en dos extremos opuestos (perfecto o fracaso, bueno o malo) sin reconocer los grises.",
    ejemplo: "Ejemplo: «Si no saco un 20, soy un completo fracaso».",
    acento: PALETTE.rosa,
  },
  {
    key: "generalizacion-excesiva",
    numero: "5.2",
    titulo: "Generalización excesiva",
    pregunta: "¿Tomas un hecho aislado como una regla universal?",
    explicacion: "A partir de un único evento negativo se concluye que ocurrirá siempre.",
    ejemplo: "Ejemplo: «Esta cita salió mal, nadie querrá nunca estar conmigo».",
    acento: PALETTE.mostaza,
  },
  {
    key: "filtro-mental",
    numero: "5.3",
    titulo: "Filtro mental",
    pregunta: "¿Te enfocas sólo en lo negativo e ignoras lo positivo?",
    explicacion: "Se selecciona un detalle negativo y se medita sobre él hasta teñir toda la realidad.",
    ejemplo: "Ejemplo: De diez comentarios buenos sobre tu trabajo, sólo recuerdas el único crítico.",
    acento: PALETTE.azul,
  },
  {
    key: "descalificacion-positivo",
    numero: "5.4",
    titulo: "Descalificación de lo positivo",
    pregunta: "¿Restas valor a las cosas buenas que te ocurren?",
    explicacion: "Se rechazan las experiencias positivas insistiendo en que «no cuentan» por algún motivo.",
    ejemplo: "Ejemplo: «Me felicitaron, pero sólo lo hicieron por compromiso».",
    acento: PALETTE.oliva,
  },
  {
    key: "conclusiones-precipitadas-lectura",
    numero: "5.5",
    titulo: "Conclusiones precipitadas — Lectura del pensamiento",
    pregunta: "¿Sueles suponer, sin pruebas, lo que las otras personas piensan de ti?",
    explicacion: "Se asume lo que el otro piensa o siente sin comprobarlo y se actúa como si fuera un hecho cierto.",
    ejemplo: "Ejemplo: «Ha pasado por mi lado y se ha reído, ha querido burlarse de mí».",
    acento: PALETTE.rosa,
  },
  {
    key: "conclusiones-precipitadas-anticipacion",
    numero: "5.6",
    titulo: "Conclusiones precipitadas — Anticipación negativa",
    pregunta: "¿Esperas que las cosas salgan mal antes de que ocurran y actúas en consecuencia?",
    explicacion: "Se transforma una predicción negativa en un hecho cierto, evitando situaciones o tomando decisiones basadas en ese supuesto.",
    ejemplo: "Ejemplo: «No voy a organizar la fiesta porque nada saldrá bien».",
    acento: PALETTE.rosa,
  },
  {
    key: "magnificacion-catastrofizacion",
    numero: "5.7",
    titulo: "Magnificación / Catastrofización",
    pregunta: "¿Exageras los problemas o imaginas el peor desenlace?",
    explicacion: "Se amplifica la importancia de los errores propios o se minimiza la de los logros, y se prevén catástrofes.",
    ejemplo: "Ejemplo: «Si me equivoco en la presentación, me despedirán y arruinaré mi carrera».",
    acento: PALETTE.mostaza,
  },
  {
    key: "razonamiento-emocional",
    numero: "5.8",
    titulo: "Razonamiento emocional",
    pregunta: "¿Asumes que tus emociones reflejan la realidad?",
    explicacion: "«Lo siento, luego es verdad». Las emociones se toman como prueba objetiva de los hechos.",
    ejemplo: "Ejemplo: «Me siento culpable, entonces algo malo hice».",
    acento: PALETTE.azul,
  },
  {
    key: "los-deberias",
    numero: "5.9",
    titulo: "Los «deberías»",
    pregunta: "¿Te exiges con frases del tipo «debería» o «tengo que»?",
    explicacion: "Reglas rígidas sobre cómo deben comportarse uno mismo o los demás. Genera culpa y frustración.",
    ejemplo: "Ejemplo: «Debería poder con todo sin pedir ayuda».",
    acento: PALETTE.oliva,
  },
  {
    key: "etiquetacion",
    numero: "5.10",
    titulo: "Etiquetación",
    pregunta: "¿Te pones (o pones a otros) etiquetas globales por errores puntuales?",
    explicacion: "Es una forma extrema de generalización: se sustituye la conducta por una identidad fija.",
    ejemplo: "Ejemplo: «Soy un inútil» en lugar de «esta vez no salió bien».",
    acento: PALETTE.rosa,
  },
  {
    key: "personalizacion",
    numero: "5.11",
    titulo: "Personalización",
    pregunta: "¿Te atribuyes la culpa de cosas que no dependen totalmente de ti?",
    explicacion: "Se asume responsabilidad por hechos externos o se interpreta cualquier acto ajeno como reacción personal.",
    ejemplo: "Ejemplo: «Mi hija reprobó: soy una mala madre».",
    acento: PALETTE.mostaza,
  },
];

interface ItemValue { key: string; value: number }

interface Record {
  id: number;
  pacienteId: number;
  assignmentId: number | null;
  items: ItemValue[];
  notas: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit?: boolean;
}

interface Props {
  assignmentId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function hoursLeft(createdAt: string): number {
  const left = EDIT_WINDOW_MS - (Date.now() - new Date(createdAt).getTime());
  return Math.max(0, Math.floor(left / (60 * 60 * 1000)));
}

export default function DistorsionesRealidadForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<"history" | "form">("history");
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [values, setValues] = useState<{ [k: string]: number }>(
    Object.fromEntries(DISTORSIONES.map(d => [d.key, 0])),
  );
  const [notas, setNotas] = useState<string>("");

  const refresh = async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/distorsiones/mine", { credentials: "include" });
      if (r.ok) setRecords(await r.json());
      else setRecords([]);
    } catch { setRecords([]); }
    setLoadingList(false);
  };

  useEffect(() => { void refresh(); }, []);

  const startNew = () => {
    setEditingId(null);
    setValues(Object.fromEntries(DISTORSIONES.map(d => [d.key, 0])));
    setNotas("");
    setView("form");
  };

  const startEdit = (rec: Record) => {
    setEditingId(rec.id);
    const vmap: { [k: string]: number } = Object.fromEntries(DISTORSIONES.map(d => [d.key, 0]));
    for (const it of rec.items ?? []) {
      if (typeof it.key === "string" && typeof it.value === "number") vmap[it.key] = it.value;
    }
    setValues(vmap);
    setNotas(rec.notas ?? "");
    setView("form");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = DISTORSIONES.map(d => ({ key: d.key, value: values[d.key] ?? 0 }));
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/distorsiones/${editingId}` : "/api/distorsiones/mine";
      const method = isEdit ? "PATCH" : "POST";
      const body: any = { items, notas: notas || null };
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
        title: isEdit ? "Registro actualizado" : "¡Registro guardado!",
        description: isEdit
          ? "Tus cambios fueron almacenados."
          : "Gracias por compartir cómo te sientes hoy.",
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
      const r = await fetch(`/api/distorsiones/${rec.id}`, { method: "DELETE", credentials: "include" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "No se pudo eliminar");
      toast({ title: "Registro eliminado" });
      await refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Intenta nuevamente." });
    }
  };

  const promedio = useMemo(() => {
    const arr = DISTORSIONES.map(d => values[d.key] ?? 0);
    if (!arr.length) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }, [values]);

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
              style={{ background: `linear-gradient(135deg, ${PALETTE.rosa}, ${PALETTE.mostaza})` }}
            >
              <BrainCircuit className="w-7 h-7" style={{ color: PALETTE.tinta }} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-display font-semibold" style={{ color: PALETTE.tinta }}>
                Distorsiones de la percepción de la realidad
              </h2>
              <p className="text-sm mt-1" style={{ color: PALETTE.tinta + "B0" }}>
                Una herramienta CBT para identificar qué tan presentes están 11 distorsiones cognitivas en tu pensamiento. Puedes registrarla las veces que quieras.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full" style={{ background: PALETTE.azul + "55", color: PALETTE.tinta }}>
                <ClockIcon className="w-3.5 h-3.5" />
                Podrás editar o eliminar cada registro durante 48 horas después de guardarlo.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-5">
            <Button onClick={startNew} className="rounded-full shadow-sm" style={{ background: PALETTE.tinta, color: "white" }}>
              <Sparkles className="w-4 h-4 mr-2" /> Nuevo registro
            </Button>
            <Button onClick={onCancel} variant="outline" className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2" style={{ color: PALETTE.tinta }}>
            <HistoryIcon className="w-5 h-5" /> Historial
          </h3>
          {loadingList ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: PALETTE.tinta }} /></div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border p-8 text-center" style={{ borderColor: PALETTE.azul + "66", background: PALETTE.crema + "55" }}>
              <p style={{ color: PALETTE.tinta + "AA" }}>Aún no has llenado esta tarea. Crea tu primer registro cuando estés lista/o.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {records.map((rec) => {
                const total = (rec.items ?? []).reduce((s, it) => s + (it.value ?? 0), 0);
                const avg = rec.items?.length ? Math.round(total / rec.items.length) : 0;
                const editable = rec.canEdit ?? (Date.now() - new Date(rec.createdAt).getTime() < EDIT_WINDOW_MS);
                const left = hoursLeft(rec.createdAt);
                return (
                  <div
                    key={rec.id}
                    className="rounded-xl border p-4 flex flex-wrap items-center gap-4 shadow-sm"
                    style={{ borderColor: PALETTE.azul + "55", background: "white" }}
                  >
                    <div
                      className="w-14 h-14 rounded-xl flex flex-col items-center justify-center text-white shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${PALETTE.rosa}, ${PALETTE.mostaza})` }}
                    >
                      <span className="text-lg font-bold leading-none">{avg}</span>
                      <span className="text-[10px] opacity-80">prom.</span>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-medium" style={{ color: PALETTE.tinta }}>
                        {format(new Date(rec.createdAt), "EEEE d 'de' MMMM, yyyy · HH:mm", { locale: es })}
                      </p>
                      <p className="text-xs" style={{ color: PALETTE.tinta + "99" }}>
                        {rec.items?.length ?? 0} distorsiones registradas
                        {editable
                          ? <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: PALETTE.oliva + "44", color: PALETTE.tinta }}>
                              <ClockIcon className="w-3 h-3" /> editable {left}h más
                            </span>
                          : <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#E5E7EB", color: "#6B7280" }}>
                              <AlertTriangle className="w-3 h-3" /> bloqueado (+48h)
                            </span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
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
            {isEdit ? "Editar registro" : "Nuevo registro"}
          </h2>
          <p className="text-sm" style={{ color: PALETTE.tinta + "AA" }}>
            Indica del 0 al 100 qué tan presente sientes hoy cada distorsión.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="px-3 py-2 rounded-xl text-sm shadow-sm"
            style={{ background: "white", border: `1px solid ${PALETTE.azul}66`, color: PALETTE.tinta }}
          >
            Promedio actual: <span className="font-semibold">{promedio}</span>
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

      <div className="grid gap-4">
        {DISTORSIONES.map((d) => {
          const v = values[d.key] ?? 0;
          return (
            <div
              key={d.key}
              className="rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
              style={{ background: "white", borderColor: d.acento + "88", borderLeftWidth: 6, borderLeftColor: d.acento }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-sm"
                  style={{ background: d.acento, color: PALETTE.tinta }}
                >
                  {d.numero}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-lg" style={{ color: PALETTE.tinta }}>{d.titulo}</h3>
                  <p className="text-sm mt-1" style={{ color: PALETTE.tinta }}>{d.pregunta}</p>
                  <p className="text-sm mt-1" style={{ color: PALETTE.tinta + "B0" }}>{d.explicacion}</p>
                  <p className="text-xs italic mt-1" style={{ color: PALETTE.tinta + "88" }}>{d.ejemplo}</p>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-2" style={{ color: PALETTE.tinta + "AA" }}>
                      <span>Nada presente · 0</span>
                      <span className="font-semibold text-base" style={{ color: PALETTE.tinta }}>{v}</span>
                      <span>Muy presente · 100</span>
                    </div>
                    <Slider
                      value={[v]}
                      onValueChange={(arr) => setValues((prev) => ({ ...prev, [d.key]: arr[0] ?? 0 }))}
                      min={0}
                      max={100}
                      step={1}
                      disabled={editLocked}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: "white", borderColor: PALETTE.azul + "88" }}
      >
        <label className="font-display font-semibold text-base block mb-2" style={{ color: PALETTE.tinta }}>
          Notas (opcional)
        </label>
        <Textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="¿Algo del día que quieras anotar para tu psicólogo/a?"
          rows={3}
          maxLength={4000}
          disabled={editLocked}
        />
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => setView("history")} className="rounded-full">
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving || editLocked} className="rounded-full shadow-sm"
          style={{ background: PALETTE.tinta, color: "white" }}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {isEdit ? "Guardar cambios" : "Guardar registro"}
        </Button>
      </div>
    </div>
  );
}
