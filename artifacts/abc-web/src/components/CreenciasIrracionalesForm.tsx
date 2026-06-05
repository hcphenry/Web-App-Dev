import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Save, Loader2, Pencil, Trash2, X,
  History as HistoryIcon, BrainCircuit, Clock as ClockIcon,
  AlertTriangle, Sparkles,
} from "lucide-react";

// ── Paleta "Positivamente" (paleta de colores POSITIVAMENTE.pdf) ────────────
const PALETTE = {
  oliva:   "#ABAE84",
  azul:    "#AEC8D2",
  mostaza: "#D4AE7F",
  crema:   "#F2EADF",
  rosa:    "#EBC1BC",
  tinta:   "#333333",
};

interface Creencia {
  key: string;
  numero: string;
  pregunta: string;
  acento: string; // hex from palette
}

const CREENCIAS: Creencia[] = [
  {
    key: "ser-amado-aceptado",
    numero: "1",
    pregunta:
      "Necesito ser amado y aceptado por las personas significativas de mi entorno.",
    acento: PALETTE.rosa,
  },
  {
    key: "valioso-competente",
    numero: "2",
    pregunta:
      "Para considerarme valioso tengo que ser muy competente y conseguir mis objetivos en todos los aspectos posibles.",
    acento: PALETTE.mostaza,
  },
  {
    key: "castigo-inmorales",
    numero: "3",
    pregunta:
      "Hay personas que son inmorales y perversas y deben ser acusadas y castigadas por sus defectos y malas acciones.",
    acento: PALETTE.azul,
  },
  {
    key: "catastrofico-no-querer",
    numero: "4",
    pregunta:
      "Es tremendo y catastrófico que las cosas no salgan como uno quiere.",
    acento: PALETTE.oliva,
  },
  {
    key: "desgracia-externa",
    numero: "5",
    pregunta:
      "La desgracia humana se origina por causas externas y no tenemos capacidad para controlar los trastornos que nos produce.",
    acento: PALETTE.rosa,
  },
  {
    key: "preocupacion-constante",
    numero: "6",
    pregunta:
      "Si algo es o puede ser peligroso o amenazante debo sentirme muy inquieto y preocuparme constantemente por la posibilidad de que ocurra lo peor.",
    acento: PALETTE.mostaza,
  },
  {
    key: "rehuir-dificultades",
    numero: "7",
    pregunta:
      "Es más fácil rehuir las dificultades y responsabilidades de la vida que afrontarlas. La vida tiene que ser fácil.",
    acento: PALETTE.azul,
  },
  {
    key: "depender-fuerte",
    numero: "8",
    pregunta:
      "Dependemos de los demás, por tanto necesito tener a alguien más fuerte que yo en quien poder confiar y de quien depender.",
    acento: PALETTE.oliva,
  },
  {
    key: "pasado-determina",
    numero: "9",
    pregunta:
      "El pasado me determina. Algo que me ocurrió una vez y me conmocionó debe seguir afectándome indefinidamente.",
    acento: PALETTE.rosa,
  },
  {
    key: "preocuparme-problemas-otros",
    numero: "10",
    pregunta:
      "Debo preocuparme constantemente por los problemas de los demás.",
    acento: PALETTE.mostaza,
  },
  {
    key: "solucion-perfecta",
    numero: "11",
    pregunta:
      "Existe una solución perfecta para los problemas humanos y es catastrófico si no se encuentra.",
    acento: PALETTE.azul,
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

export default function CreenciasIrracionalesForm({ assignmentId, psiPacienteId, psiRecord, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const psiMode = psiPacienteId != null;

  const valuesFromRecord = (rec: any): { [k: string]: number } => {
    const vmap: { [k: string]: number } = Object.fromEntries(CREENCIAS.map(d => [d.key, 0]));
    for (const it of rec?.items ?? []) {
      if (typeof it.key === "string" && typeof it.value === "number") vmap[it.key] = it.value;
    }
    return vmap;
  };

  const [view, setView] = useState<"history" | "form">(psiMode ? "form" : "history");
  const [records, setRecords] = useState<Record[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(psiMode ? (psiRecord?.id ?? null) : null);
  const [values, setValues] = useState<{ [k: string]: number }>(
    psiMode && psiRecord ? valuesFromRecord(psiRecord) : Object.fromEntries(CREENCIAS.map(d => [d.key, 0])),
  );
  const [notas, setNotas] = useState<string>(psiMode ? (psiRecord?.notas ?? "") : "");

  const refresh = async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/creencias-irracionales/mine", { credentials: "include" });
      if (r.ok) setRecords(await r.json());
      else setRecords([]);
    } catch { setRecords([]); }
    setLoadingList(false);
  };

  useEffect(() => {
    if (psiMode) { setLoadingList(false); return; }
    void refresh();
  }, []);

  const startNew = () => {
    setEditingId(null);
    setValues(Object.fromEntries(CREENCIAS.map(d => [d.key, 0])));
    setNotas("");
    setView("form");
  };

  const startEdit = (rec: Record) => {
    setEditingId(rec.id);
    const vmap: { [k: string]: number } = Object.fromEntries(CREENCIAS.map(d => [d.key, 0]));
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
      const items = CREENCIAS.map(d => ({ key: d.key, value: values[d.key] ?? 0 }));
      if (psiMode) {
        const isEditPsi = !!psiRecord?.id;
        const url = isEditPsi
          ? `/api/creencias-irracionales/psi/${psiRecord.id}`
          : `/api/creencias-irracionales/psi/for-patient/${psiPacienteId}`;
        const method = isEditPsi ? "PATCH" : "POST";
        const r = await fetch(url, {
          method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, notas: notas || null }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "No se pudo guardar");
        toast({ title: "Registro guardado" });
        onSaved();
        return;
      }
      const isEdit = editingId !== null;
      const url = isEdit ? `/api/creencias-irracionales/${editingId}` : "/api/creencias-irracionales/mine";
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
      const r = await fetch(`/api/creencias-irracionales/${rec.id}`, { method: "DELETE", credentials: "include" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "No se pudo eliminar");
      toast({ title: "Registro eliminado" });
      await refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message || "Intenta nuevamente." });
    }
  };

  const promedio = useMemo(() => {
    const arr = CREENCIAS.map(d => values[d.key] ?? 0);
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
                Creencias irracionales
              </h2>
              <p className="text-sm mt-1" style={{ color: PALETTE.tinta + "B0" }}>
                Identifica del 0 al 100 qué tan presentes están en ti 11 creencias irracionales descritas por Albert Ellis. Puedes registrarla las veces que quieras.
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
                        {rec.items?.length ?? 0} creencias registradas
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
            Indica del 0 al 100 qué tan presente sientes hoy cada creencia irracional.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="px-3 py-2 rounded-xl text-sm shadow-sm"
            style={{ background: "white", border: `1px solid ${PALETTE.azul}66`, color: PALETTE.tinta }}
          >
            Promedio actual: <span className="font-semibold">{promedio}</span>
          </div>
          <Button variant="outline" onClick={() => psiMode ? onCancel() : setView("history")} className="rounded-full">
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
        {CREENCIAS.map((d) => {
          const v = values[d.key] ?? 0;
          return (
            <div
              key={d.key}
              className="rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
              style={{ background: "white", borderColor: d.acento + "88", borderLeftWidth: 6, borderLeftColor: d.acento }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold shadow-sm"
                  style={{ background: d.acento, color: PALETTE.tinta }}
                >
                  {d.numero}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base mt-1" style={{ color: PALETTE.tinta }}>{d.pregunta}</p>

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
