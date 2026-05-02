import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, ClipboardList } from "lucide-react";

interface Props {
  assignmentId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

type Field = { key: string; label: string; type?: "text" | "textarea" | "date" };
type Section = { id: string; title: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    id: "datos",
    title: "Datos personales",
    fields: [
      { key: "nombrePersonaConsulta", label: "Nombre de la persona en consulta" },
      { key: "estadoCivil", label: "Estado civil" },
      { key: "lugarResidencia", label: "Lugar de residencia actual" },
      { key: "nivelEstudiosPadres", label: "Nivel de estudios (padres)" },
      { key: "profesionActual", label: "Profesión actual" },
      { key: "nombrePaciente", label: "Nombre del paciente" },
      { key: "edadPaciente", label: "Edad del paciente" },
      { key: "fechaNacimientoPaciente", label: "Fecha de nacimiento (paciente)", type: "date" },
      { key: "enfermedadOMedicacion", label: "¿Padece de alguna enfermedad o toma algún tipo de medicación?", type: "textarea" },
      { key: "especialistaSalud", label: "¿Ha acudido a algún especialista de salud últimamente?", type: "textarea" },
      { key: "conQuienVive", label: "¿Con quién vive actualmente?", type: "textarea" },
    ],
  },
  {
    id: "motivo",
    title: "Motivo de consulta",
    fields: [
      { key: "motivoConsulta", label: "¿Cuál es el motivo de su consulta?", type: "textarea" },
      { key: "desdeCuandoProblema", label: "¿Desde cuándo presenta este problema?", type: "textarea" },
      { key: "conductaHabitual", label: "¿Cuál es su conducta habitual?", type: "textarea" },
    ],
  },
  {
    id: "habitos",
    title: "Hábitos y vida cotidiana",
    fields: [
      { key: "habitosSueno", label: "¿Cómo son sus hábitos de sueño?", type: "textarea" },
      { key: "habitosAlimenticios", label: "¿Cómo son sus hábitos alimenticios?", type: "textarea" },
      { key: "relacionDemas", label: "¿Cómo se relaciona con los demás?", type: "textarea" },
      { key: "estadoEmocionalActual", label: "¿Cuál es su estado emocional actual?", type: "textarea" },
    ],
  },
  {
    id: "objetivos",
    title: "Intentos previos y objetivos",
    fields: [
      { key: "queHaIntentado", label: "¿Qué ha intentado hasta ahora para solucionar dicho problema?", type: "textarea" },
      { key: "aspectosMejorar", label: "¿Qué aspectos desea mejorar?", type: "textarea" },
      { key: "comentarioAdicional", label: "Desea añadir un comentario adicional", type: "textarea" },
    ],
  },
  {
    id: "diagnostica",
    title: "Presunción diagnóstica (uso clínico)",
    fields: [
      { key: "presuncionDiagnostica", label: "Presunción diagnóstica", type: "textarea" },
      { key: "derivacionEvalPsicologica", label: "¿Derivación a evaluación psicológica?", type: "textarea" },
    ],
  },
];

export default function ConsultaPsicologicaForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  const [fechaConsulta, setFechaConsulta] = useState(isoToday);
  const [data, setData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  const setField = (k: string, v: string) => setData(d => ({ ...d, [k]: v }));

  const handleSave = async () => {
    if (!fechaConsulta.trim()) {
      toast({ title: "Falta la fecha", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/consulta-psicologica/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignmentId ?? null,
          fechaConsulta,
          nombrePersonaConsulta: data.nombrePersonaConsulta ?? null,
          nombrePaciente: data.nombrePaciente ?? null,
          data,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Error al guardar");
      }
      toast({ title: "Consulta guardada", description: "El formulario de consulta se registró correctamente." });
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
      <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-rose-50 to-pink-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-200">
            <ClipboardList className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-rose-700 uppercase tracking-wider">Consulta Psicológica</p>
            <h2 className="text-xl font-display font-semibold text-foreground">Jóvenes y Adultos</h2>
            <p className="text-sm text-muted-foreground">
              Formulario de consulta. Puedes completarlo tantas veces como sea necesario; cada envío queda registrado.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <h3 className="text-lg font-display font-semibold">Información general</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="fechaConsulta">Fecha *</Label>
            <Input
              id="fechaConsulta"
              type="date"
              value={fechaConsulta}
              onChange={e => setFechaConsulta(e.target.value)}
              data-testid="input-cp-fecha"
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
                ? "bg-rose-500 text-white shadow"
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
                  type={f.type === "date" ? "date" : "text"}
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
            data-testid="btn-save-consulta-psicologica"
            className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Guardar consulta
          </Button>
        </div>
      </div>
    </div>
  );
}
