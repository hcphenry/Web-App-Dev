import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Activity } from "lucide-react";

interface Props {
  assignmentId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

const SECTIONS: Array<{ id: string; title: string; fields: Array<{ key: string; label: string; type?: "text" | "textarea" }> }> = [
  {
    id: "objetivos",
    title: "Objetivos de la sesión",
    fields: [
      { key: "objetivosSesion", label: "¿Cuáles son los objetivos específicos de esta sesión?", type: "textarea" },
    ],
  },
  {
    id: "resumen",
    title: "Resumen de la sesión",
    fields: [
      { key: "resumenDiscusion", label: "Describa lo que se discutió durante la sesión", type: "textarea" },
      { key: "temasAbordados", label: "¿Qué temas o problemas se abordaron?", type: "textarea" },
      { key: "intervencionesUsadas", label: "¿Qué intervenciones o técnicas se utilizaron?", type: "textarea" },
    ],
  },
  {
    id: "observaciones",
    title: "Observaciones y notas",
    fields: [
      { key: "observacionesImportantes", label: "¿Qué observaciones o notas importantes se pueden destacar de la sesión?", type: "textarea" },
      { key: "patronesRecurrentes", label: "¿Hay algún patrón o tema recurrente que deba ser abordado en futuras sesiones?", type: "textarea" },
    ],
  },
  {
    id: "proxima",
    title: "Tareas y objetivos para la próxima sesión",
    fields: [
      { key: "tareasProximaSesion", label: "¿Qué tareas o objetivos se asignan al paciente para la próxima sesión?", type: "textarea" },
      { key: "objetivosAntesProxima", label: "¿Qué objetivos específicos se deben lograr antes de la próxima sesión?", type: "textarea" },
    ],
  },
  {
    id: "evaluacion",
    title: "Evaluación de la sesión",
    fields: [
      { key: "comoSesintioPaciente", label: "¿Cómo consideras que se sintió el paciente durante la sesión?", type: "textarea" },
      { key: "aspectosUtiles", label: "¿Qué aspectos de la sesión fueron más útiles o efectivos?", type: "textarea" },
      { key: "aspectosAMejorar", label: "¿Qué aspectos de la sesión podrían ser mejorados?", type: "textarea" },
    ],
  },
  {
    id: "plan",
    title: "Plan de acción",
    fields: [
      { key: "accionesEspecificas", label: "¿Qué acciones específicas se deben tomar para abordar los objetivos y temas discutidos durante la sesión?", type: "textarea" },
      { key: "recursosApoyos", label: "¿Qué recursos o apoyos adicionales pueden ser necesarios para el paciente?", type: "textarea" },
    ],
  },
];

export default function DesarrolloSesionForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Información de la sesión (encabezado)
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const isoTime = today.toTimeString().slice(0, 5);

  const [fechaSesion, setFechaSesion] = useState(isoToday);
  const [horaSesion, setHoraSesion] = useState(isoTime);
  const [numeroSesion, setNumeroSesion] = useState("");
  const [data, setData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  const setField = (k: string, v: string) => setData(d => ({ ...d, [k]: v }));

  const handleSave = async () => {
    if (!fechaSesion.trim()) {
      toast({ title: "Falta la fecha de la sesión", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/desarrollo-sesion/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignmentId ?? null,
          fechaSesion,
          horaSesion,
          numeroSesion,
          data,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Error al guardar");
      }
      toast({ title: "Sesión guardada", description: "El desarrollo de la sesión se registró correctamente." });
      queryClient.invalidateQueries({ queryKey: ["mine-tasks"] });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const section = SECTIONS[activeSection];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-emerald-50 to-teal-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-700 uppercase tracking-wider">Desarrollo Sesión</p>
            <h2 className="text-xl font-display font-semibold text-foreground">Formato de Sesión Psicológica</h2>
            <p className="text-sm text-muted-foreground">
              Esta guía puede variar según las necesidades específicas del terapeuta y del paciente. Adáptala a cada caso.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <h3 className="text-lg font-display font-semibold">Información de la sesión</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="fechaSesion">Fecha *</Label>
            <Input
              id="fechaSesion"
              type="date"
              value={fechaSesion}
              onChange={e => setFechaSesion(e.target.value)}
              data-testid="input-ds-fecha"
            />
          </div>
          <div>
            <Label htmlFor="horaSesion">Hora</Label>
            <Input
              id="horaSesion"
              type="time"
              value={horaSesion}
              onChange={e => setHoraSesion(e.target.value)}
              data-testid="input-ds-hora"
            />
          </div>
          <div>
            <Label htmlFor="numeroSesion">Número de sesión</Label>
            <Input
              id="numeroSesion"
              value={numeroSesion}
              onChange={e => setNumeroSesion(e.target.value)}
              placeholder="Ej. 3"
              data-testid="input-ds-numero"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === activeSection
                ? "bg-emerald-500 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <h3 className="text-lg font-display font-semibold">{section.title}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {section.fields.map(f => (
            <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
              <Label htmlFor={f.key}>{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={f.key}
                  value={data[f.key] ?? ""}
                  onChange={e => setField(f.key, e.target.value)}
                  rows={4}
                />
              ) : (
                <Input
                  id={f.key}
                  value={data[f.key] ?? ""}
                  onChange={e => setField(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onCancel} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Volver
        </Button>
        <div className="flex gap-2">
          {activeSection > 0 && (
            <Button variant="outline" onClick={() => setActiveSection(s => s - 1)} className="rounded-xl">
              Sección anterior
            </Button>
          )}
          {activeSection < SECTIONS.length - 1 && (
            <Button variant="outline" onClick={() => setActiveSection(s => s + 1)} className="rounded-xl">
              Siguiente sección
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid="btn-save-desarrollo-sesion"
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Guardar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
