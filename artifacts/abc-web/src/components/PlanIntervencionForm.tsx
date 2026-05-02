import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, Target, Plus, Trash2 } from "lucide-react";

interface Props {
  assignmentId?: number | null;
  /** Si está definido, el formulario lo envía un psicólogo/admin EN NOMBRE del paciente indicado. */
  forPacienteId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

interface SesionRow {
  objetivoEspecifico: string;
  actividades: string;
  tiempo: string;
  materiales: string;
}

const SESSION_COUNT = 8;
const emptyRow = (): SesionRow => ({ objetivoEspecifico: "", actividades: "", tiempo: "", materiales: "" });

export default function PlanIntervencionForm({ assignmentId, forPacienteId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);

  // Datos generales
  const [pacienteNombre, setPacienteNombre] = useState("");
  const [edad, setEdad] = useState("");
  const [areasEvaluar, setAreasEvaluar] = useState("");
  const [diasTrabajo, setDiasTrabajo] = useState("");
  const [horarioTrabajo, setHorarioTrabajo] = useState("");
  const [periodoTratamiento, setPeriodoTratamiento] = useState("");
  const [fechaEmision, setFechaEmision] = useState(today);
  const [responsable, setResponsable] = useState("");
  const [objetivoGeneral, setObjetivoGeneral] = useState("");

  // 8 sesiones, cada una con filas de tabla
  const [sesiones, setSesiones] = useState<SesionRow[][]>(
    Array.from({ length: SESSION_COUNT }, () => [emptyRow()])
  );

  const [activeSesion, setActiveSesion] = useState(0);
  const [saving, setSaving] = useState(false);

  const updateRow = (sIdx: number, rIdx: number, field: keyof SesionRow, value: string) => {
    setSesiones(prev => prev.map((s, i) => {
      if (i !== sIdx) return s;
      return s.map((r, j) => (j === rIdx ? { ...r, [field]: value } : r));
    }));
  };
  const addRow = (sIdx: number) =>
    setSesiones(prev => prev.map((s, i) => (i === sIdx ? [...s, emptyRow()] : s)));
  const removeRow = (sIdx: number, rIdx: number) =>
    setSesiones(prev => prev.map((s, i) => {
      if (i !== sIdx) return s;
      const next = s.filter((_, j) => j !== rIdx);
      return next.length ? next : [emptyRow()];
    }));

  const handleSave = async () => {
    if (!pacienteNombre.trim()) {
      toast({ title: "Falta el nombre del paciente", variant: "destructive" });
      return;
    }
    if (!fechaEmision.trim()) {
      toast({ title: "Falta la fecha de emisión", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const data = {
        pacienteNombre,
        edad,
        areasEvaluar,
        diasTrabajo,
        horarioTrabajo,
        periodoTratamiento,
        fechaEmision,
        responsable,
        objetivoGeneral,
        sesiones: sesiones.map((rows, i) => ({ numero: i + 1, rows })),
      };
      const url = forPacienteId
        ? `/api/plan-intervencion/for-patient/${forPacienteId}`
        : "/api/plan-intervencion/mine";
      const body = forPacienteId
        ? { pacienteNombre, fechaEmision, responsable, data }
        : { assignmentId: assignmentId ?? null, pacienteNombre, fechaEmision, responsable, data };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Error al guardar");
      }
      toast({ title: "Plan guardado", description: "El plan de intervención se registró correctamente." });
      queryClient.invalidateQueries({ queryKey: ["mine-tasks"] });
      if (forPacienteId) {
        queryClient.invalidateQueries({ queryKey: ["psicologo-patient-plan-intervencion", forPacienteId] });
      }
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const rows = sesiones[activeSesion];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-indigo-50 to-violet-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Target className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-700 uppercase tracking-wider">Plan de Intervención</p>
            <h2 className="text-xl font-display font-semibold text-foreground">Jóvenes y Adultos</h2>
            <p className="text-sm text-muted-foreground">
              Define el plan de tratamiento con objetivo general y hasta 8 sesiones, indicando actividades, tiempos y materiales.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <h3 className="text-lg font-display font-semibold">Datos generales</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pacienteNombre">Paciente *</Label>
            <Input id="pacienteNombre" value={pacienteNombre} onChange={e => setPacienteNombre(e.target.value)} data-testid="input-pi-paciente" />
          </div>
          <div>
            <Label htmlFor="edad">Edad</Label>
            <Input id="edad" value={edad} onChange={e => setEdad(e.target.value)} placeholder="Ej. 28 años" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="areasEvaluar">Áreas a evaluar</Label>
            <Textarea id="areasEvaluar" value={areasEvaluar} onChange={e => setAreasEvaluar(e.target.value)} rows={2} />
          </div>
          <div>
            <Label htmlFor="diasTrabajo">Días de trabajo</Label>
            <Input id="diasTrabajo" value={diasTrabajo} onChange={e => setDiasTrabajo(e.target.value)} placeholder="Ej. Martes y jueves" />
          </div>
          <div>
            <Label htmlFor="horarioTrabajo">Horario de trabajo</Label>
            <Input id="horarioTrabajo" value={horarioTrabajo} onChange={e => setHorarioTrabajo(e.target.value)} placeholder="Ej. 5:00 p. m. – 6:00 p. m." />
          </div>
          <div>
            <Label htmlFor="periodoTratamiento">Periodo de tratamiento</Label>
            <Input id="periodoTratamiento" value={periodoTratamiento} onChange={e => setPeriodoTratamiento(e.target.value)} placeholder="Ej. 8 semanas" />
          </div>
          <div>
            <Label htmlFor="fechaEmision">Fecha de emisión *</Label>
            <Input id="fechaEmision" type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} data-testid="input-pi-fecha" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="responsable">Responsable</Label>
            <Input id="responsable" value={responsable} onChange={e => setResponsable(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="objetivoGeneral">Objetivo general</Label>
            <Textarea id="objetivoGeneral" value={objetivoGeneral} onChange={e => setObjetivoGeneral(e.target.value)} rows={3} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {sesiones.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveSesion(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === activeSesion
                ? "bg-indigo-500 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Sesión {i + 1}
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold">Sesión {activeSesion + 1}</h3>
          <Button variant="outline" size="sm" onClick={() => addRow(activeSesion)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> Agregar fila
          </Button>
        </div>

        <div className="space-y-4">
          {rows.map((row, rIdx) => (
            <div key={rIdx} className="rounded-xl border p-4 bg-white/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Fila {rIdx + 1}</span>
                {rows.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeRow(activeSesion, rIdx)} className="text-red-600 h-7">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Objetivo específico</Label>
                  <Textarea
                    value={row.objetivoEspecifico}
                    onChange={e => updateRow(activeSesion, rIdx, "objetivoEspecifico", e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Actividades</Label>
                  <Textarea
                    value={row.actividades}
                    onChange={e => updateRow(activeSesion, rIdx, "actividades", e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Tiempo</Label>
                  <Input
                    value={row.tiempo}
                    onChange={e => updateRow(activeSesion, rIdx, "tiempo", e.target.value)}
                    placeholder="Ej. 20 min"
                  />
                </div>
                <div>
                  <Label>Materiales</Label>
                  <Input
                    value={row.materiales}
                    onChange={e => updateRow(activeSesion, rIdx, "materiales", e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onCancel} className="rounded-xl">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Volver
        </Button>
        <div className="flex gap-2">
          {activeSesion > 0 && (
            <Button variant="outline" onClick={() => setActiveSesion(s => s - 1)} className="rounded-xl">
              Sesión anterior
            </Button>
          )}
          {activeSesion < SESSION_COUNT - 1 && (
            <Button variant="outline" onClick={() => setActiveSesion(s => s + 1)} className="rounded-xl">
              Siguiente sesión
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            data-testid="btn-save-plan-intervencion"
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Guardar plan
          </Button>
        </div>
      </div>
    </div>
  );
}
