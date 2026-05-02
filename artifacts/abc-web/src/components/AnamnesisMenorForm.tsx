import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Loader2, FileText } from "lucide-react";

interface Props {
  assignmentId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

const SECTIONS: Array<{ id: string; title: string; fields: Array<{ key: string; label: string; type?: "text" | "textarea" }> }> = [
  {
    id: "datosGenerales",
    title: "Datos generales",
    fields: [
      { key: "fecha", label: "Fecha" },
      { key: "edad", label: "Edad" },
      { key: "sexo", label: "Sexo" },
      { key: "grado", label: "Grado" },
      { key: "particularEstatal", label: "Particular o estatal" },
      { key: "alumnosPorAula", label: "N° de alumnos por aula" },
      { key: "institucionEducativa", label: "Institución Educativa" },
      { key: "lugarFechaNacimiento", label: "Lugar y fecha de nacimiento" },
      { key: "viveCon", label: "Vive con" },
      { key: "nombreMadre", label: "Nombre de la madre" },
      { key: "nombrePadre", label: "Nombre del padre" },
      { key: "edadMadre", label: "Edad madre" },
      { key: "edadPadre", label: "Edad padre" },
      { key: "escolaridadMadre", label: "Escolaridad madre" },
      { key: "escolaridadPadre", label: "Escolaridad padre" },
      { key: "ocupacionMadre", label: "Ocupación madre" },
      { key: "ocupacionPadre", label: "Ocupación padre" },
      { key: "religionMadre", label: "Religión madre" },
      { key: "religionPadre", label: "Religión padre" },
      { key: "estadoCivilMadre", label: "Estado civil madre" },
      { key: "estadoCivilPadre", label: "Estado civil padre" },
    ],
  },
  {
    id: "consulta",
    title: "Motivo, historia y conducta",
    fields: [
      { key: "motivoConsulta", label: "Motivo de consulta", type: "textarea" },
      { key: "historiaProblema", label: "Historia del problema", type: "textarea" },
      { key: "conductaHabitual", label: "Conducta habitual", type: "textarea" },
    ],
  },
  {
    id: "embarazo",
    title: "Embarazo y parto",
    fields: [
      { key: "preNatalCuidados", label: "Etapa pre-natal: cuidados", type: "textarea" },
      { key: "preNatalComplicaciones", label: "Etapa pre-natal: complicaciones", type: "textarea" },
      { key: "periNatalCuidados", label: "Etapa peri-natal: cuidados", type: "textarea" },
      { key: "periNatalComplicaciones", label: "Etapa peri-natal: complicaciones", type: "textarea" },
      { key: "postNatalCuidados", label: "Etapa post-natal: cuidados", type: "textarea" },
      { key: "postNatalComplicaciones", label: "Etapa post-natal: complicaciones", type: "textarea" },
      { key: "tipoParto", label: "Tipo de parto (Normal / Cesárea)" },
      { key: "semanasParto", label: "Semanas" },
      { key: "embarazoObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "motor",
    title: "Desarrollo motor",
    fields: [
      { key: "motorSostuvoCabeza", label: "Sostuvo la cabeza" },
      { key: "motorVolteoCuerpo", label: "Volteó el cuerpo" },
      { key: "motorSeSento", label: "Se sentó" },
      { key: "motorSeParo", label: "Se paró" },
      { key: "motorGateo", label: "Gateó" },
      { key: "motorCaminoConAyuda", label: "Caminó con ayuda" },
      { key: "motorSubioGradas", label: "Subió gradas" },
      { key: "motorCorrio", label: "Corrió" },
      { key: "motorSalto", label: "Saltó" },
      { key: "motorPinto", label: "Pintó" },
      { key: "motorRayas", label: "Rayas" },
      { key: "motorGarabatos", label: "Dibujó garabatos" },
      { key: "motorManoUtiliza", label: "Mano que utiliza más" },
      { key: "motorObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "esfinteres",
    title: "Control de esfínteres",
    fields: [
      { key: "esfinterAvisoOrinar", label: "Edad para avisar para orinar" },
      { key: "esfinterAvisoDefecar", label: "Edad para avisar para defecar" },
      { key: "esfinterMetodos", label: "Qué métodos utilizó para avisar" },
      { key: "esfinterDificultad", label: "Ha tenido alguna dificultad con el control" },
      { key: "esfinterTipoDificultad", label: "De qué tipo" },
      { key: "esfinterDuracion", label: "Cuánto tiempo duraron esas dificultades" },
      { key: "esfinterObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "lenguaje",
    title: "Lenguaje",
    fields: [
      { key: "lenguajeSonrio", label: "Sonrió por primera vez" },
      { key: "lenguajeBalbuceo", label: "Balbuceó" },
      { key: "lenguajeVocalizo", label: "Vocalizó" },
      { key: "lenguajeFrases", label: "Dijo frases" },
      { key: "lenguajeOraciones", label: "Dijo oraciones" },
      { key: "lenguajeInstrucciones", label: "Siguió instrucciones" },
      { key: "lenguajeObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "salud",
    title: "Historial de salud",
    fields: [
      { key: "saludHospitalizado", label: "Ha sido hospitalizado" },
      { key: "saludMotivo", label: "Motivo" },
      { key: "saludEdadHospitalizacion", label: "Edad" },
      { key: "saludTiempoHospitalizacion", label: "Por cuánto tiempo" },
      { key: "saludGolpes", label: "Golpes fuertes que haya sufrido", type: "textarea" },
      { key: "saludEnfermedades", label: "Enfermedades que ha padecido", type: "textarea" },
      { key: "saludAntecedentesFamiliares", label: "Antecedentes familiares de salud", type: "textarea" },
      { key: "saludEnfermedadMentalFamiliar", label: "Algún pariente con enfermedad mental o conducta anormal", type: "textarea" },
      { key: "saludObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "social",
    title: "Relaciones sociales",
    fields: [
      { key: "socialRelacion", label: "Cómo se relaciona con las demás personas", type: "textarea" },
      { key: "socialJuegos", label: "Qué juegos le gustan" },
      { key: "socialJuegaMayores", label: "Juega con niños mayores" },
      { key: "socialJuegaMenores", label: "Juega con niños menores" },
      { key: "socialJuegaEdad", label: "Juega con niños de su edad" },
      { key: "socialJuegaOtroSexo", label: "Juega con niños del otro sexo" },
      { key: "socialAnimalesAgradan", label: "Animales que le agradan" },
      { key: "socialAnimalesDesagradan", label: "Animales que le desagradan" },
      { key: "socialPrefiereSoloAcompanado", label: "Prefiere estar solo o acompañado" },
      { key: "socialComportamientoGrupo", label: "Cómo se comporta dentro de un grupo", type: "textarea" },
      { key: "socialReunionesSociales", label: "Le gusta ir a reuniones sociales" },
      { key: "socialDiversiones", label: "Qué diversiones le gustan" },
      { key: "socialParticipaGrupos", label: "Participa en grupos de algún tipo" },
      { key: "socialObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "escolar",
    title: "Historia escolar",
    fields: [
      { key: "escolarPrimeraAsistencia", label: "A qué edad y en qué año asistió por primera vez a la escuela" },
      { key: "escolarAdaptacion", label: "Cómo fue su adaptación", type: "textarea" },
      { key: "escolarRendimiento", label: "Cómo ha sido su rendimiento escolar", type: "textarea" },
      { key: "escolarRepitio", label: "Ha repetido grado" },
      { key: "escolarCualesGrados", label: "Cuáles" },
      { key: "escolarMotivoRepitencia", label: "Motivo de la repitencia" },
      { key: "escolarRelacionMaestros", label: "Relación con sus maestros", type: "textarea" },
      { key: "escolarCambioEscuela", label: "Ha sido cambiado de escuela / Motivo" },
      { key: "escolarVeces", label: "Cuántas veces" },
      { key: "escolarObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
  {
    id: "familiar",
    title: "Historia familiar",
    fields: [
      { key: "familiarConformacionHogar", label: "Cómo está conformado el hogar", type: "textarea" },
      { key: "familiarRelacionPadre", label: "Relación con el padre", type: "textarea" },
      { key: "familiarRelacionMadre", label: "Relación con la madre", type: "textarea" },
      { key: "familiarHermanos", label: "Tiene hermanos / lugar que ocupa" },
      { key: "familiarRelacionHermanos", label: "Relación con sus hermanos", type: "textarea" },
      { key: "familiarRelacionPadresHijos", label: "Relación de los padres con los demás hijos", type: "textarea" },
      { key: "familiarCelosRivalidad", label: "Existen celos o rivalidad / razón", type: "textarea" },
      { key: "familiarMiembroIdoFallecido", label: "Algún miembro se ha ido o fallecido (quién, cuándo, motivo)", type: "textarea" },
      { key: "familiarMiembroIntegrado", label: "Se ha integrado recientemente algún miembro / cómo fluyó el niño", type: "textarea" },
      { key: "familiarColaboraQuehaceres", label: "De qué manera colabora en los quehaceres", type: "textarea" },
      { key: "familiarComportamientoEnFamilia", label: "Cómo ven los padres su comportamiento en familia", type: "textarea" },
      { key: "familiarAlcoholismoDrogadiccion", label: "Existe alcoholismo o drogadicción / quién", type: "textarea" },
      { key: "familiarAfectacionAlcoholDrogas", label: "Cómo le ha afectado", type: "textarea" },
      { key: "familiarTrauma", label: "Considera que ha vivido alguna situación traumática / cuál", type: "textarea" },
      { key: "familiarTraumaAfectacion", label: "Cómo le ha afectado", type: "textarea" },
      { key: "familiarObservaciones", label: "Observaciones", type: "textarea" },
    ],
  },
];

export default function AnamnesisMenorForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nombreNino, setNombreNino] = useState("");
  const [data, setData] = useState<Record<string, string>>({});
  const [entrevistador, setEntrevistador] = useState("");
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
      const r = await fetch("/api/anamnesis/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignmentId ?? null,
          nombreNino,
          edad: data.edad ?? null,
          sexo: data.sexo ?? null,
          motivoConsulta: data.motivoConsulta ?? null,
          entrevistador: entrevistador || null,
          data,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Error al guardar");
      }
      toast({ title: "Anamnesis guardada", description: "La tarea se marcó como completada." });
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
      <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-200">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-700 uppercase tracking-wider">Anamnesis menor 18</p>
            <h2 className="text-xl font-display font-semibold text-foreground">Historia clínica infantil</h2>
            <p className="text-sm text-muted-foreground">Completa cada sección. Puedes navegar entre secciones antes de guardar.</p>
          </div>
        </div>
      </div>

      {/* Header común: nombre del niño + entrevistador */}
      <div className="glass-panel rounded-2xl p-6 border space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="nombreNino">Nombre del niño/a *</Label>
            <Input
              id="nombreNino"
              value={nombreNino}
              onChange={e => setNombreNino(e.target.value)}
              placeholder="Nombre completo"
              data-testid="input-nombre-nino"
            />
          </div>
          <div>
            <Label htmlFor="entrevistador">Nombre del entrevistador</Label>
            <Input
              id="entrevistador"
              value={entrevistador}
              onChange={e => setEntrevistador(e.target.value)}
              placeholder="Profesional que toma los datos"
            />
          </div>
        </div>
      </div>

      {/* Navegación de secciones */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(i)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === activeSection
                ? "bg-amber-500 text-white shadow"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </div>

      {/* Sección activa */}
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
            data-testid="btn-save-anamnesis"
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
            Guardar anamnesis
          </Button>
        </div>
      </div>
    </div>
  );
}
