import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  useCreateRecord, 
  useListMyRecords, 
  useGetMe,
  getListMyRecordsQueryKey,
  getGetMeQueryKey,
  type CreateRecordRequest 
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRight, ArrowLeft, CheckCircle2, MessageCircle, 
  BrainCircuit, Activity, Lightbulb, History, FileText, UserCircle, Loader2, Save,
  Home, Lock, ChevronRight, LayoutDashboard, Circle, ClipboardList,
  Clock as ClockIcon, PlayCircle, type LucideIcon
} from "lucide-react";
import AnamnesisMenorForm from "@/components/AnamnesisMenorForm";
import PrimeraConsultaNinosForm from "@/components/PrimeraConsultaNinosForm";
import DesarrolloSesionForm from "@/components/DesarrolloSesionForm";
import ConsultaPsicologicaForm from "@/components/ConsultaPsicologicaForm";

interface MyTaskAssignment {
  id: number;
  taskId: number;
  taskKey: string;
  taskName: string;
  taskDescription: string;
  taskIcon: string;
  taskColor: string;
  taskBadgeColor: string;
  taskRoutePath: string | null;
  taskIsAvailable: boolean;
  status: 'pendiente' | 'en_progreso' | 'completada' | 'cancelada';
  dueDate: string | null;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}

const TASK_ICON_MAP: Record<string, LucideIcon> = {
  BrainCircuit, Circle, ClipboardList, Activity, Lightbulb, FileText,
};

interface PatientProfile {
  id?: number;
  userId?: number;
  primerNombre?: string | null;
  segundoNombre?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  perioricidad?: string | null;
  fechaAlta?: string | null;
  estado?: string | null;
  nroCelular?: string | null;
  tipoDocumento?: string | null;
  numeroDocumento?: string | null;
  fechaNacimiento?: string | null;
  sexo?: string | null;
  direccion?: string | null;
  distrito?: string | null;
  ciudad?: string | null;
  departamento?: string | null;
  pais?: string | null;
  costoTerapia?: string | null;
  psicologaAsignada?: string | null;
}

export default function RegisterAbc() {
  const [step, setStep] = useState(1);
  const [view, setView] = useState<'dashboard' | 'form' | 'history' | 'account' | 'anamnesis' | 'primera-consulta' | 'desarrollo-sesion' | 'consulta-psicologica-adultos'>('dashboard');
  const [activeAnamnesisAssignment, setActiveAnamnesisAssignment] = useState<number | null>(null);
  const [activePrimeraConsultaAssignment, setActivePrimeraConsultaAssignment] = useState<number | null>(null);
  const [activeDesarrolloSesionAssignment, setActiveDesarrolloSesionAssignment] = useState<number | null>(null);
  const [activeConsultaPsicologicaAssignment, setActiveConsultaPsicologicaAssignment] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Partial<CreateRecordRequest>>({
    intensidad: 5
  });
  const [wantsReflection, setWantsReflection] = useState(false);

  // Account forms state
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Clinical profile state
  const [profile, setProfile] = useState<PatientProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (view === 'account') {
      setLoadingProfile(true);
      fetch('/api/patient/profile')
        .then(r => { if (!r.ok) throw new Error("Error al cargar perfil"); return r.json(); })
        .then(data => { setProfile(data ?? {}); })
        .catch(() => { toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar tu perfil. Intenta nuevamente.' }); })
        .finally(() => setLoadingProfile(false));
    }
  }, [view]);

  const { data: records, isLoading: loadingRecords } = useListMyRecords();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  
  const createMut = useCreateRecord({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyRecordsQueryKey() });
        toast({ title: "¡Excelente!", description: "Tu registro ABC ha sido guardado exitosamente." });
        resetForm();
        setView('history');
      }
    }
  });

  const resetForm = () => {
    setFormData({ intensidad: 5 });
    setWantsReflection(false);
    setStep(1);
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.email || !emailForm.currentPassword) return;
    setSavingEmail(true);
    try {
      const res = await fetch('/api/auth/me/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Correo actualizado", description: data.message });
      setEmailForm({ email: '', currentPassword: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) return;
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: 'destructive', title: 'Error', description: 'Las contraseñas nuevas no coinciden' });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      toast({ title: "Contraseña actualizada", description: data.message });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      setProfile(data);
      toast({ title: "Perfil guardado", description: "Tu información clínica ha sido actualizada." });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && !formData.situacion) { toast({ variant: "destructive", title: "Completa el campo", description: "Describe la situación para continuar." }); return; }
    if (step === 2 && !formData.pensamientos) { toast({ variant: "destructive", title: "Completa el campo", description: "Escribe tus pensamientos para continuar." }); return; }
    if (step === 3 && (!formData.emocion || !formData.conducta)) { toast({ variant: "destructive", title: "Completa los campos", description: "Indica tu emoción y conducta para continuar." }); return; }
    
    setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => s - 1);

  const submitForm = () => {
    createMut.mutate({ 
      data: formData as CreateRecordRequest 
    });
  };

  const steps = [
    { num: 1, title: "Situación", icon: MessageCircle },
    { num: 2, title: "Pensamiento", icon: BrainCircuit },
    { num: 3, title: "Emoción y Conducta", icon: Activity },
    { num: 4, title: "Reflexión", icon: Lightbulb },
    { num: 5, title: "Resumen", icon: CheckCircle2 },
  ];

  // Tareas asignadas a este paciente — vienen del backend (Portal Tareas)
  const myTasksQ = useQuery<MyTaskAssignment[]>({
    queryKey: ["mine-tasks"],
    queryFn: async () => {
      const r = await fetch("/api/tareas/mine");
      if (!r.ok) return [];
      return r.json();
    },
  });
  const myAssignments = myTasksQ.data ?? [];

  // Mark assignment as started/completed when patient interacts with it
  const markStartedMut = async (assignmentId: number) => {
    try { await fetch(`/api/tareas/mine/${assignmentId}/start`, { method: "POST" }); } catch {}
    queryClient.invalidateQueries({ queryKey: ["mine-tasks"] });
  };
  const markCompletedMut = async (assignmentId: number) => {
    try { await fetch(`/api/tareas/mine/${assignmentId}/complete`, { method: "POST" }); } catch {}
    queryClient.invalidateQueries({ queryKey: ["mine-tasks"] });
  };

  // Derive renderable cards from assignments. If a paciente has no assignments
  // we fall back to the legacy hardcoded catalog so the existing UX is preserved
  // (e.g. para usuarios que aún no fueron asignados por su psicólogo/admin).
  const therapeuticTasks = (myAssignments.length > 0
    ? myAssignments.map((a) => {
        const Icon = TASK_ICON_MAP[a.taskIcon] ?? ClipboardList;
        const isABC = a.taskKey === 'registro-abc';
        const isAnamnesis = a.taskKey === 'anamnesis-menor';
        const isPrimeraConsulta = a.taskKey === 'primera-consulta-ninos';
        const isDesarrolloSesion = a.taskKey === 'desarrollo-sesion';
        const isConsultaPsicologicaAdultos = a.taskKey === 'consulta-psicologica-adultos';
        const available = a.taskIsAvailable && a.status !== 'cancelada';
        const statusLabel =
          a.status === 'completada' ? 'Completada' :
          a.status === 'en_progreso' ? 'En progreso' :
          a.status === 'cancelada' ? 'Cancelada' :
          available ? 'Pendiente' : 'Próximamente';
        const statusBadge =
          a.status === 'completada' ? 'bg-emerald-100 text-emerald-700' :
          a.status === 'en_progreso' ? 'bg-sky-100 text-sky-700' :
          a.status === 'cancelada' ? 'bg-slate-100 text-slate-500' :
          available ? 'bg-amber-100 text-amber-700' : a.taskBadgeColor;
        return {
          id: `${a.taskKey}-${a.id}`,
          title: a.taskName,
          description: a.taskDescription || (a.notes ?? ''),
          icon: Icon,
          available,
          color: a.taskColor,
          badgeColor: statusBadge,
          badge: statusLabel,
          onActivate: () => {
            if (!available) return;
            // Mark as started if still pending
            if (a.status === 'pendiente') void markStartedMut(a.id);
            if (isABC) { resetForm(); setView('form'); }
            else if (isAnamnesis) { setActiveAnamnesisAssignment(a.id); setView('anamnesis'); }
            else if (isPrimeraConsulta) { setActivePrimeraConsultaAssignment(a.id); setView('primera-consulta'); }
            else if (isDesarrolloSesion) { setActiveDesarrolloSesionAssignment(a.id); setView('desarrollo-sesion'); }
            else if (isConsultaPsicologicaAdultos) { setActiveConsultaPsicologicaAssignment(a.id); setView('consulta-psicologica-adultos'); }
          },
          onViewHistory: isABC ? () => setView('history') : undefined,
          // Repetibles (ABC, Desarrollo Sesión y Consulta Psicológica) no muestran el botón
          // "Marcar completada" porque el paciente puede registrarlas muchas veces.
          onComplete: (isABC || isDesarrolloSesion || isConsultaPsicologicaAdultos)
            ? undefined
            : (a.status !== 'completada' && a.status !== 'cancelada'
                ? () => void markCompletedMut(a.id)
                : undefined),
        };
      })
    : [
        {
          id: 'registro-abc',
          title: 'Registro ABC',
          description: 'Identifica situaciones, pensamientos automáticos y sus consecuencias emocionales.',
          icon: BrainCircuit,
          available: true,
          color: 'from-indigo-500 to-purple-600',
          badgeColor: 'bg-indigo-100 text-indigo-700',
          badge: 'Disponible',
          onActivate: () => { resetForm(); setView('form'); },
          onViewHistory: () => setView('history'),
          onComplete: undefined as undefined | (() => void),
        },
        {
          id: 'rueda-vida',
          title: 'La Rueda de la Vida',
          description: 'Evalúa el equilibrio en las distintas áreas de tu vida personal y profesional.',
          icon: Circle,
          available: false,
          color: 'from-slate-300 to-slate-400',
          badgeColor: 'bg-slate-100 text-slate-500',
          badge: 'Próximamente',
          onActivate: () => {},
          onViewHistory: undefined,
          onComplete: undefined as undefined | (() => void),
        },
      ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
          <div>
            {view === 'dashboard' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">
                  Hola{me?.email ? ', ' + me.email.split('@')[0] : ''} 👋
                </h1>
                <p className="text-muted-foreground mt-1">Aquí están tus tareas terapéuticas</p>
              </>
            )}
            {view === 'form' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Registro ABC</h1>
                <p className="text-muted-foreground mt-1">Identifica y gestiona tus reacciones emocionales</p>
              </>
            )}
            {view === 'history' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Historial</h1>
                <p className="text-muted-foreground mt-1">Tus registros ABC anteriores</p>
              </>
            )}
            {view === 'account' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Mi Cuenta</h1>
                <p className="text-muted-foreground mt-1">Gestiona tu perfil y configuración</p>
              </>
            )}
            {view === 'anamnesis' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Anamnesis menor 18</h1>
                <p className="text-muted-foreground mt-1">Historia clínica infantil</p>
              </>
            )}
            {view === 'primera-consulta' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Primera consulta niños</h1>
                <p className="text-muted-foreground mt-1">Formulario de admisión</p>
              </>
            )}
            {view === 'desarrollo-sesion' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Desarrollo Sesión</h1>
                <p className="text-muted-foreground mt-1">Formato de sesión psicológica</p>
              </>
            )}
            {view === 'consulta-psicologica-adultos' && (
              <>
                <h1 className="text-3xl font-display font-bold text-foreground">Consulta Psicológica</h1>
                <p className="text-muted-foreground mt-1">Jóvenes y adultos · formulario de consulta</p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant={view === 'dashboard' ? "default" : "outline"}
              onClick={() => setView('dashboard')}
              className="rounded-full shadow-sm"
            >
              <Home className="w-4 h-4 mr-2" /> Inicio
            </Button>
            <Button
              variant={view === 'history' ? "default" : "outline"}
              onClick={() => setView('history')}
              className="rounded-full shadow-sm"
            >
              <History className="w-4 h-4 mr-2" /> Historial
            </Button>
            <Button
              variant={view === 'account' ? "default" : "outline"}
              onClick={() => setView('account')}
              className="rounded-full shadow-sm"
            >
              <UserCircle className="w-4 h-4 mr-2" /> Mi Cuenta
            </Button>
          </div>
        </div>

        {/* ── DASHBOARD VIEW ── */}
        {view === 'dashboard' && me && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Sección de bienvenida */}
            <div className="glass-panel rounded-2xl p-6 border bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                  <LayoutDashboard className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-indigo-600 uppercase tracking-wider">Panel Terapéutico</p>
                  <h2 className="text-xl font-display font-semibold text-foreground">Tus Tareas Asignadas</h2>
                  <p className="text-sm text-muted-foreground">Selecciona una tarea para comenzar tu sesión de hoy</p>
                </div>
              </div>
            </div>

            {/* Grid de tarjetas de tareas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {therapeuticTasks.map((task) => {
                const TaskIcon = task.icon;
                return (
                  <div
                    key={task.id}
                    role={task.available ? 'button' : undefined}
                    tabIndex={task.available ? 0 : undefined}
                    onClick={task.available ? task.onActivate : undefined}
                    onKeyDown={task.available ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); task.onActivate(); }
                    } : undefined}
                    className={`group relative glass-panel rounded-2xl border overflow-hidden transition-all duration-300 ${
                      task.available
                        ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1 hover:border-indigo-200'
                        : 'opacity-70'
                    }`}
                  >
                    {/* Barra de color superior */}
                    <div className={`h-1.5 w-full bg-gradient-to-r ${task.color}`} />

                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${task.color} flex items-center justify-center shadow-sm`}>
                          <TaskIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${task.badgeColor}`}>
                            {task.badge}
                          </span>
                          {!task.available && <Lock className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      <h3 className="text-lg font-display font-bold text-foreground mb-1">{task.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>

                      {task.available && (
                        <div className="mt-5 pt-4 border-t border-border/50 flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); task.onActivate(); }}
                            className="rounded-xl flex-1 min-w-[140px] bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-sm"
                          >
                            Comenzar tarea
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                          {task.onViewHistory && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); task.onViewHistory!(); }}
                              className="rounded-xl flex-1 min-w-[120px]"
                            >
                              <History className="w-4 h-4 mr-1.5" />
                              Ver historial
                            </Button>
                          )}
                          {(task as { onComplete?: () => void }).onComplete && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => { e.stopPropagation(); (task as { onComplete?: () => void }).onComplete!(); }}
                              className="rounded-xl flex-1 min-w-[140px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              data-testid={`btn-complete-${task.id}`}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1.5" />
                              Marcar completada
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'anamnesis' && (
          <AnamnesisMenorForm
            assignmentId={activeAnamnesisAssignment}
            onCancel={() => { setView('dashboard'); setActiveAnamnesisAssignment(null); }}
            onSaved={() => { setView('dashboard'); setActiveAnamnesisAssignment(null); }}
          />
        )}

        {view === 'primera-consulta' && (
          <PrimeraConsultaNinosForm
            assignmentId={activePrimeraConsultaAssignment}
            onCancel={() => { setView('dashboard'); setActivePrimeraConsultaAssignment(null); }}
            onSaved={() => { setView('dashboard'); setActivePrimeraConsultaAssignment(null); }}
          />
        )}

        {view === 'desarrollo-sesion' && (
          <DesarrolloSesionForm
            assignmentId={activeDesarrolloSesionAssignment}
            onCancel={() => { setView('dashboard'); setActiveDesarrolloSesionAssignment(null); }}
            onSaved={() => { setView('dashboard'); setActiveDesarrolloSesionAssignment(null); }}
          />
        )}

        {view === 'consulta-psicologica-adultos' && (
          <ConsultaPsicologicaForm
            assignmentId={activeConsultaPsicologicaAssignment}
            onCancel={() => { setView('dashboard'); setActiveConsultaPsicologicaAssignment(null); }}
            onSaved={() => { setView('dashboard'); setActiveConsultaPsicologicaAssignment(null); }}
          />
        )}

        {view === 'history' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {loadingRecords ? (
              <div className="text-center py-12 text-muted-foreground">Cargando registros...</div>
            ) : !records?.length ? (
              <div className="text-center py-16 glass-panel rounded-3xl border-dashed">
                <div className="bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-primary/50" />
                </div>
                <h3 className="text-xl font-display font-semibold">No hay registros aún</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">Comienza a registrar tus situaciones para entender mejor tus patrones emocionales y conductuales.</p>
                <Button onClick={() => setView('form')} className="mt-6 rounded-full">Crear mi primer registro</Button>
              </div>
            ) : (
              <div className="grid gap-6">
                {records.map(record => (
                  <div key={record.id} className="glass-panel p-6 rounded-2xl hover:shadow-lg transition-shadow duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                        {format(new Date(record.createdAt), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}
                      </div>
                    </div>
                    
                    <div className="grid sm:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">A</span>
                          Situación
                        </div>
                        <p className="text-sm text-muted-foreground bg-white/50 p-3 rounded-xl min-h-20">{record.situacion}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs">B</span>
                          Pensamientos
                        </div>
                        <p className="text-sm text-muted-foreground bg-white/50 p-3 rounded-xl min-h-20">{record.pensamientos}</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs">C</span>
                          Consecuencia
                        </div>
                        <div className="text-sm text-muted-foreground bg-white/50 p-3 rounded-xl min-h-20 space-y-2">
                          <div className="flex justify-between items-center border-b border-border/50 pb-2">
                            <span className="font-medium text-foreground capitalize">{record.emocion}</span>
                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">{record.intensidad}/10</span>
                          </div>
                          <p>{record.conducta}</p>
                        </div>
                      </div>
                    </div>
                    {record.reflexion && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 text-foreground font-semibold mb-2">
                          <Lightbulb className="w-4 h-4 text-amber-500" />
                          Pensamiento Alternativo
                        </div>
                        <p className="text-sm text-muted-foreground italic">"{record.reflexion}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'account' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="glass-panel p-6 rounded-2xl border">
              <div className="flex items-center gap-3">
                <UserCircle className="w-8 h-8 text-primary" />
                <div>
                  <h2 className="text-xl font-display font-semibold">Mi Cuenta</h2>
                  <p className="text-sm text-muted-foreground">Correo actual: <span className="font-medium text-foreground">{me?.email}</span></p>
                </div>
              </div>
            </div>

            {/* Perfil Clínico */}
            <div className="glass-panel p-6 rounded-2xl border">
              <h3 className="font-semibold text-lg mb-5 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-sm">📋</span>
                Perfil Clínico
              </h3>
              {loadingProfile ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando perfil...
                </div>
              ) : (
                <form onSubmit={handleProfileSave} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Primer Nombre</Label>
                      <Input className="rounded-xl bg-white/50" value={profile.primerNombre || ''} onChange={e => setProfile(p => ({ ...p, primerNombre: e.target.value }))} placeholder="Primer nombre" />
                    </div>
                    <div className="space-y-2">
                      <Label>Segundo Nombre</Label>
                      <Input className="rounded-xl bg-white/50" value={profile.segundoNombre || ''} onChange={e => setProfile(p => ({ ...p, segundoNombre: e.target.value }))} placeholder="Segundo nombre" />
                    </div>
                    <div className="space-y-2">
                      <Label>Apellido Paterno</Label>
                      <Input className="rounded-xl bg-white/50" value={profile.apellidoPaterno || ''} onChange={e => setProfile(p => ({ ...p, apellidoPaterno: e.target.value }))} placeholder="Apellido paterno" />
                    </div>
                    <div className="space-y-2">
                      <Label>Apellido Materno</Label>
                      <Input className="rounded-xl bg-white/50" value={profile.apellidoMaterno || ''} onChange={e => setProfile(p => ({ ...p, apellidoMaterno: e.target.value }))} placeholder="Apellido materno" />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha de Nacimiento</Label>
                      <Input type="date" className="rounded-xl bg-white/50" value={profile.fechaNacimiento || ''} onChange={e => setProfile(p => ({ ...p, fechaNacimiento: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Sexo</Label>
                      <Select value={profile.sexo || ''} onValueChange={v => setProfile(p => ({ ...p, sexo: v }))}>
                        <SelectTrigger className="rounded-xl bg-white/50"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="masculino">Masculino</SelectItem>
                          <SelectItem value="femenino">Femenino</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de Documento</Label>
                      <Select value={profile.tipoDocumento || ''} onValueChange={v => setProfile(p => ({ ...p, tipoDocumento: v }))}>
                        <SelectTrigger className="rounded-xl bg-white/50"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DNI">DNI</SelectItem>
                          <SelectItem value="CE">Carné de Extranjería</SelectItem>
                          <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                          <SelectItem value="RUC">RUC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Número de Documento</Label>
                      <Input className="rounded-xl bg-white/50" value={profile.numeroDocumento || ''} onChange={e => setProfile(p => ({ ...p, numeroDocumento: e.target.value }))} placeholder="N° de documento" />
                    </div>
                    <div className="space-y-2">
                      <Label>Celular</Label>
                      <Input className="rounded-xl bg-white/50" value={profile.nroCelular || ''} onChange={e => setProfile(p => ({ ...p, nroCelular: e.target.value }))} placeholder="999 888 777" />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        Estado
                        <span className="text-xs text-muted-foreground">(asignado por administración)</span>
                      </Label>
                      <Input
                        className="rounded-xl bg-white/30 text-muted-foreground capitalize"
                        value={profile.estado || 'activo'}
                        readOnly
                        disabled
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dirección</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Dirección</Label>
                        <Input className="rounded-xl bg-white/50" value={profile.direccion || ''} onChange={e => setProfile(p => ({ ...p, direccion: e.target.value }))} placeholder="Av. / Jr. / Calle..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Distrito</Label>
                        <Input className="rounded-xl bg-white/50" value={profile.distrito || ''} onChange={e => setProfile(p => ({ ...p, distrito: e.target.value }))} placeholder="Distrito" />
                      </div>
                      <div className="space-y-2">
                        <Label>Ciudad</Label>
                        <Input className="rounded-xl bg-white/50" value={profile.ciudad || ''} onChange={e => setProfile(p => ({ ...p, ciudad: e.target.value }))} placeholder="Ciudad" />
                      </div>
                      <div className="space-y-2">
                        <Label>Departamento</Label>
                        <Input className="rounded-xl bg-white/50" value={profile.departamento || ''} onChange={e => setProfile(p => ({ ...p, departamento: e.target.value }))} placeholder="Departamento" />
                      </div>
                      <div className="space-y-2">
                        <Label>País</Label>
                        <Input className="rounded-xl bg-white/50" value={profile.pais || 'Perú'} onChange={e => setProfile(p => ({ ...p, pais: e.target.value }))} placeholder="País" />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Información Terapéutica</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Perioricidad de Sesiones</Label>
                        <Select value={profile.perioricidad || ''} onValueChange={v => setProfile(p => ({ ...p, perioricidad: v }))}>
                          <SelectTrigger className="rounded-xl bg-white/50"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="semanal">Semanal</SelectItem>
                            <SelectItem value="quincenal">Quincenal</SelectItem>
                            <SelectItem value="mensual">Mensual</SelectItem>
                            <SelectItem value="intensivo">Intensivo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Fecha de Alta Terapéutica</Label>
                        <Input type="date" className="rounded-xl bg-white/50" value={profile.fechaAlta || ''} onChange={e => setProfile(p => ({ ...p, fechaAlta: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          Psicóloga Asignada
                          <span className="text-xs text-muted-foreground">(asignado por administración)</span>
                        </Label>
                        <Input className="rounded-xl bg-white/30 text-muted-foreground" value={profile.psicologaAsignada || '—'} readOnly disabled />
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          Costo de Terapia
                          <span className="text-xs text-muted-foreground">(asignado por administración)</span>
                        </Label>
                        <Input className="rounded-xl bg-white/30 text-muted-foreground" value={profile.costoTerapia ? `S/ ${profile.costoTerapia}` : '—'} readOnly disabled />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" disabled={savingProfile} className="rounded-xl w-full">
                    {savingProfile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Guardar Perfil Clínico
                  </Button>
                </form>
              )}
            </div>

            {/* Cambiar correo */}
            <div className="glass-panel p-6 rounded-2xl border">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm">@</span>
                Cambiar correo electrónico
              </h3>
              <form onSubmit={handleEmailChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-email">Nuevo correo electrónico</Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="nuevo@correo.com"
                    className="rounded-xl bg-white/50"
                    value={emailForm.email}
                    onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-current-pass">Contraseña actual (para confirmar)</Label>
                  <Input
                    id="email-current-pass"
                    type="password"
                    placeholder="Tu contraseña actual"
                    className="rounded-xl bg-white/50"
                    value={emailForm.currentPassword}
                    onChange={e => setEmailForm(f => ({ ...f, currentPassword: e.target.value }))}
                    required
                  />
                </div>
                <Button type="submit" disabled={savingEmail} className="rounded-xl w-full">
                  {savingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Actualizar correo
                </Button>
              </form>
            </div>

            {/* Cambiar contraseña */}
            <div className="glass-panel p-6 rounded-2xl border">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm">🔒</span>
                Cambiar contraseña
              </h3>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="curr-pass">Contraseña actual</Label>
                  <Input
                    id="curr-pass"
                    type="password"
                    placeholder="Tu contraseña actual"
                    className="rounded-xl bg-white/50"
                    value={passwordForm.currentPassword}
                    onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pass">Nueva contraseña</Label>
                  <Input
                    id="new-pass"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    className="rounded-xl bg-white/50"
                    value={passwordForm.newPassword}
                    onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pass">Confirmar nueva contraseña</Label>
                  <Input
                    id="confirm-pass"
                    type="password"
                    placeholder="Repite la nueva contraseña"
                    className="rounded-xl bg-white/50"
                    value={passwordForm.confirmPassword}
                    onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    required
                  />
                </div>
                <Button type="submit" disabled={savingPassword} className="rounded-xl w-full">
                  {savingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Actualizar contraseña
                </Button>
              </form>
            </div>
          </div>
        )}

        {view === 'form' && (
          <div className="max-w-2xl mx-auto">
            {/* Progress Stepper */}
            <div className="mb-10">
              <div className="flex justify-between items-center relative">
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10"></div>
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full -z-10 transition-all duration-500 ease-out"
                  style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
                ></div>
                
                {steps.map((s) => {
                  const Icon = s.icon;
                  const isActive = step >= s.num;
                  const isCurrent = step === s.num;
                  
                  return (
                    <div key={s.num} className="flex flex-col items-center gap-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                        isActive ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white border-border text-muted-foreground'
                      } ${isCurrent ? 'ring-4 ring-primary/20 ring-offset-2 ring-offset-background scale-110' : ''}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-xs font-medium hidden sm:block absolute -bottom-6 whitespace-nowrap ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {s.title}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Form Area */}
            <div className="glass-panel p-6 sm:p-10 rounded-[2rem] shadow-xl relative min-h-[400px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="h-full flex flex-col"
                >
                  {/* STEP 1: A */}
                  {step === 1 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-100 text-blue-700 font-display font-bold text-2xl mb-2">A</div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Situación o Estímulo</h2>
                        <p className="text-muted-foreground">Describe qué ocurrió de forma objetiva. ¿Quién?, ¿Qué?, ¿Dónde? Imagina que eres una cámara de video grabando los hechos.</p>
                      </div>
                      
                      <div className="space-y-3 mt-8">
                        <Label htmlFor="situacion" className="text-base">¿Qué sucedió?</Label>
                        <Textarea 
                          id="situacion"
                          placeholder="Ej: Mi pareja no me llamó en todo el día y llegó tarde a casa..."
                          className="min-h-[150px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                          value={formData.situacion || ""}
                          onChange={e => setFormData({...formData, situacion: e.target.value})}
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                          <strong className="text-blue-700">Tip:</strong> Evita interpretaciones en este paso. Concéntrate solo en los hechos observables.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: B */}
                  {step === 2 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-700 font-display font-bold text-2xl mb-2">B</div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Pensamiento Automático</h2>
                        <p className="text-muted-foreground">¿Qué te dijiste a ti mismo en ese momento? ¿Qué pasó por tu mente justo cuando ocurrió la situación?</p>
                      </div>
                      
                      <div className="space-y-3 mt-8">
                        <Label htmlFor="pensamientos" className="text-base">¿Qué pensaste?</Label>
                        <Textarea 
                          id="pensamientos"
                          placeholder="Ej: 'Seguro ya no le intereso', 'Siempre me hace lo mismo', 'No soy importante'..."
                          className="min-h-[150px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                          value={formData.pensamientos || ""}
                          onChange={e => setFormData({...formData, pensamientos: e.target.value})}
                          autoFocus
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 3: C */}
                  {step === 3 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-100 text-teal-700 font-display font-bold text-2xl mb-2">C</div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Emoción y Conducta</h2>
                        <p className="text-muted-foreground">¿Cómo te sentiste y qué hiciste como resultado de lo que pensaste?</p>
                      </div>
                      
                      <div className="space-y-6 mt-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <Label htmlFor="emocion" className="text-base">¿Qué emoción sentiste?</Label>
                            <Input 
                              id="emocion"
                              placeholder="Ej: Tristeza, Cólera, Ansiedad..."
                              className="h-12 rounded-xl bg-white/50 focus:bg-white"
                              value={formData.emocion || ""}
                              onChange={e => setFormData({...formData, emocion: e.target.value})}
                              autoFocus
                            />
                          </div>
                          
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <Label className="text-base">Intensidad (1-10)</Label>
                              <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">{formData.intensidad || 5}</span>
                            </div>
                            <Slider 
                              min={1} max={10} step={1}
                              value={[formData.intensidad || 5]}
                              onValueChange={(val) => setFormData({...formData, intensidad: val[0]})}
                              className="py-2"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 pt-4">
                          <Label htmlFor="conducta" className="text-base">¿Qué hiciste físicamente como respuesta?</Label>
                          <Textarea 
                            id="conducta"
                            placeholder="Ej: Me fui a dormir, le grité, me quedé callado..."
                            className="min-h-[100px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                            value={formData.conducta || ""}
                            onChange={e => setFormData({...formData, conducta: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Reflexión */}
                  {step === 4 && (
                    <div className="space-y-6 flex-1">
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 text-amber-700 font-display font-bold text-2xl mb-2">
                          <Lightbulb className="w-6 h-6" />
                        </div>
                        <h2 className="text-2xl font-display font-bold text-foreground">Pensamiento Alternativo</h2>
                        <p className="text-muted-foreground">Opcional: Desafía tu pensamiento automático inicial y busca una perspectiva más realista o funcional.</p>
                      </div>
                      
                      <div className="space-y-6 mt-8">
                        <div className="flex items-center justify-between bg-white p-4 rounded-xl border">
                          <div className="space-y-0.5">
                            <Label className="text-base font-semibold">¿Deseas reflexionar?</Label>
                            <p className="text-sm text-muted-foreground">Plantear una alternativa para la próxima vez</p>
                          </div>
                          <Switch 
                            checked={wantsReflection} 
                            onCheckedChange={setWantsReflection} 
                          />
                        </div>

                        <AnimatePresence>
                          {wantsReflection && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="space-y-3 overflow-hidden"
                            >
                              <Label htmlFor="reflexion" className="text-base">Pensamiento alternativo</Label>
                              <Textarea 
                                id="reflexion"
                                placeholder="Ej: Pudo haber tenido un problema en el trabajo, no significa que no le interese..."
                                className="min-h-[150px] resize-none text-base rounded-xl bg-white/50 focus:bg-white"
                                value={formData.reflexion || ""}
                                onChange={e => setFormData({...formData, reflexion: e.target.value})}
                                autoFocus
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* STEP 5: Resumen */}
                  {step === 5 && (
                    <div className="space-y-6 flex-1">
                      <div className="text-center mb-8">
                        <h2 className="text-2xl font-display font-bold text-foreground">Revisa tu Registro</h2>
                        <p className="text-muted-foreground">Verifica que todo esté correcto antes de guardar.</p>
                      </div>
                      
                      <div className="grid gap-4 bg-white/50 p-6 rounded-2xl border">
                        <div className="grid sm:grid-cols-[40px_1fr] gap-4 pb-4 border-b border-border/50">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">A</div>
                          <div>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Situación</span>
                            <p className="text-foreground mt-1">{formData.situacion}</p>
                          </div>
                        </div>
                        
                        <div className="grid sm:grid-cols-[40px_1fr] gap-4 pb-4 border-b border-border/50">
                          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">B</div>
                          <div>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Pensamiento</span>
                            <p className="text-foreground mt-1">{formData.pensamientos}</p>
                          </div>
                        </div>
                        
                        <div className="grid sm:grid-cols-[40px_1fr] gap-4 pb-4 border-b border-border/50">
                          <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm">C</div>
                          <div>
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Consecuencia</span>
                            <div className="flex gap-2 items-center mt-1 mb-2">
                              <span className="capitalize font-medium text-foreground">{formData.emocion}</span>
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">Nivel: {formData.intensidad}/10</span>
                            </div>
                            <p className="text-foreground">{formData.conducta}</p>
                          </div>
                        </div>

                        {wantsReflection && formData.reflexion && (
                          <div className="grid sm:grid-cols-[40px_1fr] gap-4 pt-2">
                            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                              <Lightbulb className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Reflexión Alternativa</span>
                              <p className="text-foreground mt-1 italic">"{formData.reflexion}"</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="mt-8 pt-6 border-t border-border flex justify-between">
                {step === 1 ? (
                  <Button
                    variant="outline"
                    onClick={() => setView('dashboard')}
                    disabled={createMut.isPending}
                    className="rounded-xl px-6 h-12"
                  >
                    <Home className="w-4 h-4 mr-2" /> Inicio
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={prevStep}
                    disabled={createMut.isPending}
                    className="rounded-xl px-6 h-12"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Atrás
                  </Button>
                )}

                {step < 5 ? (
                  <Button 
                    onClick={nextStep}
                    className="rounded-xl px-8 h-12 shadow-lg shadow-primary/20"
                  >
                    Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button 
                    onClick={submitForm}
                    disabled={createMut.isPending}
                    className="rounded-xl px-8 h-12 bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20"
                  >
                    {createMut.isPending ? "Guardando..." : "Guardar Registro"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
