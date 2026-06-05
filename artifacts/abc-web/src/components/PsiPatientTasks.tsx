import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Pencil, Trash2, Loader2, ChevronLeft, FileText } from "lucide-react";

import AnamnesisMenorForm from "@/components/AnamnesisMenorForm";
import PrimeraConsultaNinosForm from "@/components/PrimeraConsultaNinosForm";
import DesarrolloSesionForm from "@/components/DesarrolloSesionForm";
import ConsultaPsicologicaForm from "@/components/ConsultaPsicologicaForm";
import PlanIntervencionForm from "@/components/PlanIntervencionForm";
import LineaVidaForm from "@/components/LineaVidaForm";
import DistorsionesRealidadForm from "@/components/DistorsionesRealidadForm";
import RuedaVidaForm from "@/components/RuedaVidaForm";
import CreenciasIrracionalesForm from "@/components/CreenciasIrracionalesForm";

// ── Maps each "para Psicólogos" task key to its form + API base path. ──────
// Keys mirror the patient-side mapping in register-abc.tsx. Several keys can
// share the same form/endpoint (e.g. desarrollo-sesion vs -paciente).
type FormComp = React.ComponentType<{
  psiPacienteId?: number;
  psiRecord?: any | null;
  onCancel?: () => void;
  onSaved?: () => void;
}>;

const REGISTRY: Record<string, { base: string; Form: FormComp }> = {
  "anamnesis-menor": { base: "/api/anamnesis", Form: AnamnesisMenorForm },
  "primera-consulta-ninos": { base: "/api/primera-consulta", Form: PrimeraConsultaNinosForm },
  "desarrollo-sesion": { base: "/api/desarrollo-sesion", Form: DesarrolloSesionForm },
  "desarrollo-sesion-paciente": { base: "/api/desarrollo-sesion", Form: DesarrolloSesionForm },
  "consulta-psicologica-adultos": { base: "/api/consulta-psicologica", Form: ConsultaPsicologicaForm },
  "plan-intervencion-adultos": { base: "/api/plan-intervencion", Form: PlanIntervencionForm },
  "plan-intervencion-ninos": { base: "/api/plan-intervencion", Form: PlanIntervencionForm },
  "linea-de-vida": { base: "/api/linea-vida", Form: LineaVidaForm },
  "distorsiones-realidad": { base: "/api/distorsiones", Form: DistorsionesRealidadForm },
  "rueda-vida": { base: "/api/rueda-vida", Form: RuedaVidaForm },
  "creencias-irracionales": { base: "/api/creencias-irracionales", Form: CreenciasIrracionalesForm },
};

interface PsiTask {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  targetRole?: string;
  isActive?: boolean;
}

/** Best-effort one-line summary of a psi record for the list view. */
function recordSummary(r: any): string {
  const date = r?.createdAt ? format(parseISO(r.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es }) : "Registro";
  const extra =
    r?.nombreNino ||
    r?.nombrePaciente ||
    r?.pacienteNombre ||
    (r?.numeroSesion ? `Sesión ${r.numeroSesion}` : null) ||
    r?.fechaConsulta ||
    r?.fechaSesion ||
    null;
  return extra ? `${date} · ${extra}` : date;
}

// ── One task's records + "nuevo" action ───────────────────────────────────
function PsiTaskSection({
  task, base, pacienteId, onOpenForm,
}: {
  task: PsiTask;
  base: string;
  pacienteId: number;
  onOpenForm: (record: any | null) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [delTarget, setDelTarget] = useState<any | null>(null);

  const listKey = ["psi-records", base, pacienteId];
  const { data: records = [], isLoading } = useQuery<any[]>({
    queryKey: listKey,
    queryFn: async () => {
      const r = await fetch(`${base}/psi?pacienteId=${pacienteId}`);
      if (!r.ok) throw new Error("No se pudieron cargar los registros");
      return r.json();
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${base}/psi/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("No se pudo eliminar el registro");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      toast({ title: "Registro eliminado" });
      setDelTarget(null);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message ?? "No se pudo eliminar", variant: "destructive" });
    },
  });

  return (
    <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#ABAE84]/20 text-[#ABAE84] flex items-center justify-center shrink-0">
            <ClipboardList className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground">{task.name}</p>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
            )}
          </div>
        </div>
        <Button size="sm" className="rounded-full bg-[#ABAE84] hover:bg-[#999c73] shrink-0" onClick={() => onOpenForm(null)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo
        </Button>
      </div>

      <div className="mt-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#ABAE84]" /></div>
        ) : records.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">Sin registros llenados para este paciente.</p>
        ) : (
          <div className="space-y-2">
            {records.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 bg-white/60 rounded-lg border border-border/40 px-3 py-2">
                <span className="text-xs text-foreground truncate">{recordSummary(r)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => onOpenForm(r)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" title="Eliminar" onClick={() => setDelTarget(r)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!delTarget} onOpenChange={o => !o && setDelTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el registro de <strong>{task.name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 hover:bg-rose-700"
              onClick={() => delTarget && deleteMut.mutate(delTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main: lists enabled psi-tasks for the psi, lets them fill per patient ──
export default function PsiPatientTasks({ pacienteId }: { pacienteId: number }) {
  const qc = useQueryClient();
  const [active, setActive] = useState<{ key: string; record: any | null } | null>(null);

  const { data: tasks = [], isLoading } = useQuery<PsiTask[]>({
    queryKey: ["tareas", "my-psi-tasks"],
    queryFn: async () => {
      const r = await fetch("/api/tareas/my-psi-tasks");
      if (!r.ok) throw new Error("No se pudieron cargar las tareas");
      return r.json();
    },
  });

  // Only tasks we know how to render.
  const renderable = tasks.filter(t => REGISTRY[t.key]);

  if (active) {
    const reg = REGISTRY[active.key];
    const Form = reg.Form;
    const close = () => setActive(null);
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={close}
          className="self-start text-sm text-[#ABAE84] hover:underline flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Volver a tareas
        </button>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <Form
            psiPacienteId={pacienteId}
            psiRecord={active.record}
            onCancel={close}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["psi-records", reg.base, pacienteId] });
              close();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Tareas "para Psicólogos" habilitadas para ti. Lo que llenes aquí queda asociado a este paciente y no aparece en su portal.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#ABAE84]" /></div>
      ) : renderable.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 text-[#ABAE84]/30" />
          <p className="text-sm">No tienes tareas "para Psicólogos" habilitadas.</p>
          <p className="text-xs mt-1">Pídele al administrador que te habilite tareas desde su panel.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
          {renderable.map(t => (
            <PsiTaskSection
              key={t.key}
              task={t}
              base={REGISTRY[t.key].base}
              pacienteId={pacienteId}
              onOpenForm={(record) => setActive({ key: t.key, record })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
