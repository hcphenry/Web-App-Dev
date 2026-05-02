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

const SECTIONS: Array<{ id: string; title: string; fields: Array<{ key: string; label: string; type?: "text" | "textarea" }> }> = [
  {
    id: "nino",
    title: "Información del niño",
    fields: [
      { key: "fechaNacimiento", label: "Fecha de nacimiento" },
      { key: "edad", label: "Edad" },
      { key: "grado", label: "Grado" },
      { key: "numeroHermanos", label: "Número de hermanos" },
    ],
  },
  {
    id: "padres",
    title: "Información de los padres / tutor",
    fields: [
      { key: "nombrePadreTutor", label: "Nombre y apellido del padre / madre / tutor" },
      { key: "dniPadreTutor", label: "DNI" },
      { key: "correoPadreTutor", label: "Correo electrónico" },
    ],
  },
  {
    id: "motivo",
    title: "Motivo de consulta",
    fields: [
      { key: "motivoConsulta", label: "¿Cuál es el motivo principal por el que busca ayuda psicológica para su hijo?", type: "textarea" },
      { key: "tiempoProblema", label: "¿Cuánto tiempo ha estado experimentando este problema?", type: "textarea" },
    ],
  },
  {
    id: "desarrollo",
    title: "Historia del desarrollo",
    fields: [
      { key: "problemasEmbarazoParto", label: "¿Ha habido algún problema durante el embarazo o el parto?", type: "textarea" },
      { key: "nivelDesarrollo", label: "¿Cuál es el nivel de desarrollo físico y cognitivo del niño?", type: "textarea" },
      { key: "retrasoDificultad", label: "¿Ha habido algún retraso o dificultad en el desarrollo?", type: "textarea" },
    ],
  },
  {
    id: "comportamiento",
    title: "Comportamiento y ajuste",
    fields: [
      { key: "comportamientoCasaEscuela", label: "¿Cómo describiría el comportamiento del niño en casa y en la escuela?", type: "textarea" },
      { key: "comportamiento6Meses", label: "¿Cómo ha visto su comportamiento en los últimos 6 meses?", type: "textarea" },
      { key: "cambiosRecientes", label: "¿Ha habido algún cambio reciente en la vida del niño que pueda estar relacionado con el problema?", type: "textarea" },
      { key: "horarioSueno", label: "¿A qué hora normalmente se va a dormir? ¿Duerme bien?", type: "textarea" },
      { key: "estadoEmocional6Meses", label: "¿Cómo ha visto emocionalmente a su hijo(a) en los últimos 6 meses? (aburrido, triste, etc.)", type: "textarea" },
    ],
  },
  {
    id: "salud",
    title: "Historia médica",
    fields: [
      { key: "problemaMedicoCronico", label: "¿Tiene el niño algún problema médico crónico o condición que pueda estar relacionada con su salud mental?", type: "textarea" },
      { key: "medicamentos", label: "¿Está tomando algún medicamento actualmente?", type: "textarea" },
    ],
  },
  {
    id: "relaciones",
    title: "Relaciones interpersonales",
    fields: [
      { key: "conQuienVive", label: "¿Con quién vive actualmente el paciente?", type: "textarea" },
      { key: "relacionDemas", label: "¿Cómo considera que el menor se relaciona con los demás?", type: "textarea" },
    ],
  },
  {
    id: "objetivos",
    title: "Objetivos de la terapia",
    fields: [
      { key: "esperaLograr", label: "¿Qué espera lograr con la terapia para su hijo?", type: "textarea" },
      { key: "cambiosDeseados", label: "¿Qué cambios le gustaría ver en el comportamiento o ajuste de su hijo?", type: "textarea" },
    ],
  },
];

export default function PrimeraConsultaNinosForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nombreNino, setNombreNino] = useState("");
  const [data, setData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  const setField = (k: string, v: string) => setData(d => ({ ...d, [k]: v }));

  const handleSave = async () => {
    if (!nombreNino.trim()) {
      toast({ title: "Falta el nombre del niño/a", variant: "destructive" });
      setActiveSection(0);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/primera-consulta/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignmentId ?? null,
          nombreNino,
          edad: data.edad ?? null,
          motivoConsulta: data.motivoConsulta ?? null,
          data,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Error al guardar");
      }
      toast({ title: "Primera consulta guardada", description: "La tarea se marcó como completada." });
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
      <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-sky-50 to-cyan-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-sky-200">
            <ClipboardList className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-sky-700 uppercase tracking-wider">Primera consulta niños</p>
            <h2 className="text-xl font-display font-semibold text-foreground">Formulario de admisión</h2>
            <p className="text-sm text-muted-foreground">Completa la información antes de la primera consulta presencial.</p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <div>
          <Label htmlFor="nombreNino">Nombre y apellido del niño/a *</Label>
          <Input
            id="nombreNino"
            value={nombreNino}
            onChange={e => setNombreNino(e.target.value)}
            placeholder="Nombre completo del niño/a"
            data-testid="input-pc-nombre-nino"
          />
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
                ? "bg-sky-500 text-white shadow"
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
                  rows={3}
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
            data-testid="btn-save-primera-consulta"
            className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Guardar primera consulta
          </Button>
        </div>
      </div>
    </div>
  );
}
