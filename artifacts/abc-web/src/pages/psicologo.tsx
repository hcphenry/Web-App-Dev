import { useState } from "react";
import { format, parseISO, isAfter, startOfWeek, addDays, addWeeks, subWeeks, addHours, setHours, setMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserCircle, CalendarDays, Plus, Pencil, Trash2, Loader2, Clock, CheckCircle2, XCircle, Users, FileText, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { TooltipProps } from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";

interface AvailabilitySlot {
  id: number;
  psychologistId: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  notes: string | null;
  createdAt: string;
}

interface PsychologistProfile {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  dateOfBirth: string | null;
  profession: string | null;
  registrationDate: string | null;
  deregistrationDate: string | null;
  commissionPercentage: string | null;
  licenseNumber: string | null;
}

interface AssignedPatient {
  profileId: number;
  userId: number;
  primerNombre: string | null;
  segundoNombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  perioricidad: string | null;
  fechaAlta: string | null;
  estado: string | null;
  nroCelular: string | null;
  costoTerapia: string | null;
  psicologaAsignada: string | null;
  userName: string;
  userEmail: string;
}

interface PatientFullProfile extends AssignedPatient {
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  fechaNacimiento: string | null;
  sexo: string | null;
  direccion: string | null;
  distrito: string | null;
  ciudad: string | null;
  departamento: string | null;
  pais: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AbcRecord {
  id: number;
  userId: number;
  userName: string;
  situacion: string;
  pensamientos: string;
  emocion: string;
  intensidad: number;
  conducta: string;
  reflexion: string | null;
  createdAt: string;
}

const BASE = "/api";

async function fetchProfile(): Promise<PsychologistProfile> {
  const res = await fetch(`${BASE}/psicologo/profile`);
  if (!res.ok) throw new Error("Error al cargar perfil");
  return res.json();
}

async function fetchAvailability(): Promise<AvailabilitySlot[]> {
  const res = await fetch(`${BASE}/psicologo/availability`);
  if (!res.ok) throw new Error("Error al cargar disponibilidad");
  return res.json();
}

async function fetchMyPatients(): Promise<AssignedPatient[]> {
  const res = await fetch(`${BASE}/psicologo/patients`);
  if (!res.ok) throw new Error("Error al cargar pacientes");
  return res.json();
}

async function fetchPatientProfile(userId: number): Promise<PatientFullProfile> {
  const res = await fetch(`${BASE}/psicologo/patients/${userId}/profile`);
  if (!res.ok) throw new Error("Error al cargar perfil del paciente");
  return res.json();
}

async function fetchPatientRecords(userId: number, filters: { from?: string; to?: string; emocion?: string }): Promise<AbcRecord[]> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.emocion) params.set("emocion", filters.emocion);
  const qs = params.toString();
  const res = await fetch(`${BASE}/psicologo/patients/${userId}/records${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Error al cargar registros del paciente");
  return res.json();
}

export default function PsicologoDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const { data: profile, isLoading: loadingProfile } = useQuery({ queryKey: ["psicologo-profile"], queryFn: fetchProfile });
  const { data: slots = [], isLoading: loadingSlots } = useQuery({ queryKey: ["psicologo-availability"], queryFn: fetchAvailability });
  const { data: myPatients = [], isLoading: loadingPatients } = useQuery({ queryKey: ["psicologo-patients"], queryFn: fetchMyPatients });

  // Patient modal state
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [patientModalTab, setPatientModalTab] = useState<"perfil" | "registros">("perfil");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterEmocion, setFilterEmocion] = useState("");

  const { data: selectedPatientProfile, isLoading: loadingPatientProfile } = useQuery({
    queryKey: ["psicologo-patient-profile", selectedPatientId],
    queryFn: () => fetchPatientProfile(selectedPatientId!),
    enabled: selectedPatientId !== null,
  });
  const { data: patientRecords = [], isLoading: loadingPatientRecords } = useQuery({
    queryKey: ["psicologo-patient-records", selectedPatientId, filterFrom, filterTo, filterEmocion],
    queryFn: () => fetchPatientRecords(selectedPatientId!, { from: filterFrom || undefined, to: filterTo || undefined, emocion: filterEmocion || undefined }),
    enabled: selectedPatientId !== null && patientModalTab === "registros",
  });

  // Slot form state
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<AvailabilitySlot | null>(null);
  const [slotForm, setSlotForm] = useState({ startTime: "", endTime: "", notes: "", isAvailable: true });

  // ── Lima/GMT-5 helpers — pure UTC arithmetic, zero external deps ─────────
  // Lima is always UTC-5 with no DST. Strategy: subtract 5 h from the UTC
  // timestamp to get a "shifted" Date, then read its *UTC* getters (never
  // local getters, which depend on the browser timezone).
  const LIMA_H = 5; // hours behind UTC

  /** Noon-UTC Date representing Lima's current calendar date.
   *  Use getUTC* methods on the result; never getHours/getDate. */
  const limaNoonToday = (): Date => {
    const shifted = new Date(Date.now() - LIMA_H * 3_600_000);
    return new Date(Date.UTC(
      shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12, 0, 0,
    ));
  };

  /** "HH:mm" string for a UTC ISO string expressed in Lima timezone.
   *  Works in any browser: reads getUTCHours() on the shifted timestamp. */
  const limaHHmm = (isoUtc: string): string => {
    const shifted = new Date(parseISO(isoUtc).getTime() - LIMA_H * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  };

  /** "YYYY-MM-DDTHH:mm" for a UTC ISO string in Lima timezone (for datetime-local inputs). */
  const limaInputValue = (isoUtc: string): string => {
    const shifted = new Date(parseISO(isoUtc).getTime() - LIMA_H * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  };

  /** True if the given noon-UTC calendar day matches Lima's current date. */
  const isTodayGMT5 = (day: Date): boolean => {
    const shifted = new Date(Date.now() - LIMA_H * 3_600_000);
    return day.getUTCFullYear() === shifted.getUTCFullYear()
      && day.getUTCMonth()    === shifted.getUTCMonth()
      && day.getUTCDate()     === shifted.getUTCDate();
  };

  /** True if a UTC ISO slot falls on this calendar day (Lima date). */
  const isSlotOnDay = (isoUtc: string, day: Date): boolean => {
    const shifted = new Date(parseISO(isoUtc).getTime() - LIMA_H * 3_600_000);
    return day.getUTCFullYear() === shifted.getUTCFullYear()
      && day.getUTCMonth()    === shifted.getUTCMonth()
      && day.getUTCDate()     === shifted.getUTCDate();
  };

  // Week calendar state — anchored to Lima's "today" via pure UTC arithmetic
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(limaNoonToday(), { weekStartsOn: 1 })
  );

  const SCHED_START = 7;  // 7:00 AM
  const SCHED_END = 21;   // 9:00 PM
  const PX_PER_MIN = 2;   // 2px per minute → 120px per hour

  /**
   * Form shows times in Lima/GMT-5. Convert to UTC before sending to the API.
   * Input:  "YYYY-MM-DDTHH:mm"  (Lima local time, exactly as user typed)
   * Output: "YYYY-MM-DDTHH:mm"  (UTC — Lima + 5 h)
   */
  const gmt5FormToUtc = (localDT: string): string => {
    const [datePart, timePart] = localDT.split("T");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, mi] = timePart.split(":").map(Number);
    const utcMs = Date.UTC(y, mo - 1, d, h + 5, mi); // Lima = UTC−5 → UTC = Lima+5h
    const dt = new Date(utcMs);
    // Use UTC getters — format() uses browser local timezone and would undo the +5h in Lima browsers
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
  };

  // Account state
  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // ─── Mutations ──────────────────────────────────────────────────────────
  const createSlot = useMutation({
    mutationFn: async (data: { startTime: string; endTime: string; notes: string }) => {
      const res = await fetch(`${BASE}/psicologo/availability`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear horario");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psicologo-availability"] });
      toast({ title: "Horario registrado exitosamente" });
      setSlotModalOpen(false);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const updateSlot = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`${BASE}/psicologo/availability/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al actualizar horario");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psicologo-availability"] });
      toast({ title: "Horario actualizado" });
      setSlotModalOpen(false);
      setEditingSlot(null);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/psicologo/availability/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["psicologo-availability"] });
      toast({ title: "Horario eliminado" });
      setDeletingSlot(null);
    },
    onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });

  const openCreateSlot = (prefill?: { startTime?: string; endTime?: string }) => {
    setEditingSlot(null);
    setSlotForm({ startTime: prefill?.startTime || "", endTime: prefill?.endTime || "", notes: "", isAvailable: true });
    setSlotModalOpen(true);
  };

  const openEditSlot = (slot: AvailabilitySlot) => {
    setEditingSlot(slot);
    // Convert stored UTC timestamps → Lima time for the datetime-local form inputs
    setSlotForm({
      startTime: limaInputValue(slot.startTime),
      endTime:   limaInputValue(slot.endTime),
      notes: slot.notes || "",
      isAvailable: slot.isAvailable,
    });
    setSlotModalOpen(true);
  };

  const handleSlotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Form values are in GMT-5 — convert to UTC before sending to the API
    const apiData = {
      startTime:   gmt5FormToUtc(slotForm.startTime),
      endTime:     gmt5FormToUtc(slotForm.endTime),
      notes:       slotForm.notes,
      isAvailable: slotForm.isAvailable,
    };
    if (editingSlot) {
      updateSlot.mutate({ id: editingSlot.id, data: apiData });
    } else {
      createSlot.mutate(apiData);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    try {
      const res = await fetch("/api/auth/me/email", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(emailForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({ title: "Correo actualizado", description: data.message });
      setEmailForm({ email: "", currentPassword: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally { setSavingEmail(false); }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: "destructive", title: "Error", description: "Las contraseñas nuevas no coinciden" });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/auth/me/password", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      toast({ title: "Contraseña actualizada", description: data.message });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally { setSavingPassword(false); }
  };

  const upcomingSlots = slots.filter(s => isAfter(parseISO(s.endTime), new Date()));
  const pastSlots = slots.filter(s => !isAfter(parseISO(s.endTime), new Date()));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground">Portal Psicólogo</h1>
          <p className="text-muted-foreground mt-1">Gestiona tu perfil y disponibilidad de horarios</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 p-1 bg-white/50 border backdrop-blur-md rounded-xl h-auto mb-6">
            <TabsTrigger value="profile" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <UserCircle className="w-4 h-4 mr-2" /> Mi Perfil
            </TabsTrigger>
            <TabsTrigger value="availability" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <CalendarDays className="w-4 h-4 mr-2" /> Disponibilidad
            </TabsTrigger>
            <TabsTrigger value="patients" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Users className="w-4 h-4 mr-2" /> Mis Pacientes
            </TabsTrigger>
            <TabsTrigger value="account" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <UserCircle className="w-4 h-4 mr-2" /> Mi Cuenta
            </TabsTrigger>
          </TabsList>

          {/* ── PERFIL ── */}
          <TabsContent value="profile">
            {loadingProfile ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : profile ? (
              <div className="glass-panel p-6 rounded-2xl border space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-border/50">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserCircle className="w-10 h-10 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-bold">{profile.name}</h2>
                    <p className="text-muted-foreground">{profile.email}</p>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium mt-1 inline-block">Psicólogo</span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <InfoField label="Profesión" value={profile.profession} />
                  <InfoField label="Número de Colegiatura" value={profile.licenseNumber} />
                  <InfoField label="Fecha de Nacimiento" value={profile.dateOfBirth} />
                  <InfoField label="Fecha de Alta" value={profile.registrationDate} />
                  <InfoField label="Fecha de Baja" value={profile.deregistrationDate || "—"} />
                  <InfoField label="% de Comisión" value={profile.commissionPercentage ? `${profile.commissionPercentage}%` : null} />
                </div>

                <div className="pt-2 border-t border-border/50">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumen de Pacientes</h3>
                  {loadingPatients ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 text-center">
                        <p className="text-3xl font-bold text-primary">{myPatients.length}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Total asignados</p>
                      </div>
                      <div className="rounded-xl bg-green-50 border border-green-100 p-4 text-center">
                        <p className="text-3xl font-bold text-green-700">{myPatients.filter(p => p.estado === "activo").length}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Activos</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
                        <p className="text-3xl font-bold text-gray-500">{myPatients.filter(p => p.estado === "inactivo").length}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Inactivos</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">No se pudo cargar el perfil.</div>
            )}
          </TabsContent>

          {/* ── DISPONIBILIDAD ── */}
          <TabsContent value="availability">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Mi Agenda de Disponibilidad</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Haz clic en cualquier franja horaria para registrar tu disponibilidad.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCurrentWeekStart(w => subWeeks(w, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[160px] text-center">
                    {format(currentWeekStart, "d MMM", { locale: es })} – {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: es })}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCurrentWeekStart(w => addWeeks(w, 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-full text-xs h-8 ml-1" onClick={() => setCurrentWeekStart(startOfWeek(limaNoonToday(), { weekStartsOn: 1 }))}>
                    Hoy
                  </Button>
                  <Button size="sm" className="rounded-full h-8 shadow-sm" onClick={() => openCreateSlot()}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Nuevo
                  </Button>
                </div>
              </div>

              {/* Calendar grid */}
              <div className="glass-panel rounded-2xl border overflow-hidden shadow-sm">
                {/* Day headers */}
                <div className="grid border-b bg-white/60 backdrop-blur-sm" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                  <div className="py-3" />
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = addDays(currentWeekStart, i);
                    const today = isTodayGMT5(day);
                    return (
                      <div key={i} className={`py-3 text-center border-l border-border/30 ${today ? 'bg-primary/5' : ''}`}>
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                          {format(day, 'EEE', { locale: es })}
                        </p>
                        <div className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${today ? 'bg-primary text-white' : 'text-foreground'}`}>
                          {format(day, 'd')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Scrollable time grid */}
                <div className="overflow-y-auto" style={{ maxHeight: '520px' }}>
                  {loadingSlots ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                  ) : (
                    <div className="relative grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
                      {/* Time labels column */}
                      <div className="relative z-10 bg-white/40">
                        {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                          <div key={i} style={{ height: `${PX_PER_MIN * 60}px` }} className="flex items-start justify-end pr-2 pt-1">
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {String(SCHED_START + i).padStart(2, '0')}:00
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* 7 day columns */}
                      {Array.from({ length: 7 }, (_, dayIdx) => {
                        const day = addDays(currentWeekStart, dayIdx);
                        const today = isTodayGMT5(day);
                        // Filter slots whose Lima-timezone date matches this column
                        const daySlots = slots.filter(s => isSlotOnDay(s.startTime, day));

                        return (
                          <div
                            key={dayIdx}
                            className={`relative border-l border-border/30 cursor-crosshair select-none ${today ? 'bg-primary/[0.02]' : ''}`}
                            style={{ height: `${PX_PER_MIN * 60 * (SCHED_END - SCHED_START)}px` }}
                            onClick={e => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const y = e.clientY - rect.top;
                              const rawMin = Math.floor(y / PX_PER_MIN);
                              const snappedMin = Math.round(rawMin / 30) * 30;
                              const h = Math.floor(snappedMin / 60) + SCHED_START;
                              const m = snappedMin % 60;
                              if (h >= SCHED_END) return;
                              // Build Lima datetime string without browser timezone.
                              // day is a noon-UTC Date whose getUTC* give the Lima date.
                              const padN = (n: number) => String(n).padStart(2, '0');
                              const limaDate = `${day.getUTCFullYear()}-${padN(day.getUTCMonth()+1)}-${padN(day.getUTCDate())}`;
                              const startTime = `${limaDate}T${padN(h)}:${padN(m)}`;
                              const endH = h + 1 >= SCHED_END ? SCHED_END - 1 : h + 1;
                              const endTime = `${limaDate}T${padN(endH)}:${padN(m)}`;
                              openCreateSlot({ startTime, endTime });
                            }}
                          >
                            {/* Horizontal hour lines */}
                            {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                              <div key={i} className="absolute left-0 right-0 border-t border-border/20 pointer-events-none" style={{ top: `${i * PX_PER_MIN * 60}px` }} />
                            ))}
                            {/* Half-hour dashed lines */}
                            {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                              <div key={`h${i}`} className="absolute left-0 right-0 border-t border-border/10 border-dashed pointer-events-none" style={{ top: `${(i + 0.5) * PX_PER_MIN * 60}px` }} />
                            ))}

                            {/* Slot blocks — times rendered in Lima/GMT-5 via formatInTimeZone */}
                            {daySlots.map(slot => {
                              // limaHHmm uses formatInTimeZone → timezone-safe regardless of browser
                              const startHHmm = limaHHmm(slot.startTime);
                              const endHHmm   = limaHHmm(slot.endTime);
                              const [sH, sM]  = startHHmm.split(':').map(Number);
                              const [eH, eM]  = endHHmm.split(':').map(Number);
                              const startMin  = (sH - SCHED_START) * 60 + sM;
                              const endMin    = (eH - SCHED_START) * 60 + eM;
                              const cStart = Math.max(0, startMin);
                              const cEnd   = Math.min((SCHED_END - SCHED_START) * 60, endMin);
                              const top    = cStart * PX_PER_MIN;
                              const height = Math.max((cEnd - cStart) * PX_PER_MIN, 24);

                              return (
                                <div
                                  key={slot.id}
                                  className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-xs font-medium overflow-hidden cursor-pointer transition-all hover:brightness-95 hover:shadow-md z-10 ${
                                    slot.isAvailable
                                      ? 'bg-teal-500 text-white border border-teal-400/50 shadow-sm'
                                      : 'bg-slate-400 text-white border border-slate-300/50 shadow-sm'
                                  }`}
                                  style={{ top: `${top}px`, height: `${height}px` }}
                                  onClick={e => { e.stopPropagation(); openEditSlot(slot); }}
                                  title={`${startHHmm} – ${endHHmm} (Lima GMT-5)${slot.notes ? '\n' + slot.notes : ''}`}
                                >
                                  <p className="truncate leading-tight">{startHHmm}–{endHHmm}</p>
                                  {height >= 48 && slot.notes && (
                                    <p className="truncate opacity-80 text-[10px] leading-tight mt-0.5">{slot.notes}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Legend + summary */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-teal-500" />
                  <span>Disponible</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-slate-400" />
                  <span>No disponible</span>
                </div>
                <span className="ml-auto italic">Clic en horario vacío → crear · Clic en bloque → editar</span>
              </div>
            </div>
          </TabsContent>

          {/* ── MIS PACIENTES ── */}
          <TabsContent value="patients">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Mis Pacientes</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Pacientes asignados a tu consulta. Haz clic en un paciente para ver su perfil clínico completo.</p>
              </div>
              {loadingPatients ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : myPatients.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center border border-dashed">
                  <Users className="w-12 h-12 text-primary/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No tienes pacientes asignados actualmente.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {myPatients.map(patient => (
                    <button
                      key={patient.userId}
                      onClick={() => setSelectedPatientId(patient.userId)}
                      className="glass-panel rounded-xl p-4 border text-left hover:shadow-md hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <UserCircle className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {patient.userName}
                            {(patient.primerNombre || patient.segundoNombre || patient.apellidoPaterno || patient.apellidoMaterno) && (
                              <span className="font-normal text-muted-foreground"> {[patient.primerNombre, patient.segundoNombre, patient.apellidoPaterno, patient.apellidoMaterno].filter(Boolean).join(" ")}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{patient.userEmail}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {patient.estado && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${patient.estado === "activo" ? "bg-green-100 text-green-700" : patient.estado === "inactivo" ? "bg-gray-100 text-gray-600" : "bg-yellow-100 text-yellow-700"}`}>
                                {patient.estado}
                              </span>
                            )}
                            {patient.perioricidad && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{patient.perioricidad}</span>
                            )}
                            {patient.costoTerapia && (
                              <span className="text-xs text-muted-foreground">S/ {patient.costoTerapia}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── MI CUENTA ── */}
          <TabsContent value="account">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="glass-panel p-6 rounded-2xl border">
                <div className="flex items-center gap-3">
                  <UserCircle className="w-8 h-8 text-primary" />
                  <div>
                    <h2 className="text-xl font-display font-semibold">Mi Cuenta</h2>
                    <p className="text-sm text-muted-foreground">Correo actual: <span className="font-medium text-foreground">{me?.email}</span></p>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl border">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm">@</span>
                  Cambiar correo electrónico
                </h3>
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nuevo correo electrónico</Label>
                    <Input type="email" placeholder="nuevo@correo.com" className="rounded-xl bg-white/50" value={emailForm.email}
                      onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Contraseña actual</Label>
                    <Input type="password" placeholder="Tu contraseña actual" className="rounded-xl bg-white/50" value={emailForm.currentPassword}
                      onChange={e => setEmailForm(f => ({ ...f, currentPassword: e.target.value }))} required />
                  </div>
                  <Button type="submit" disabled={savingEmail} className="rounded-xl w-full">
                    {savingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Actualizar correo
                  </Button>
                </form>
              </div>

              <div className="glass-panel p-6 rounded-2xl border">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm">🔒</span>
                  Cambiar contraseña
                </h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Contraseña actual</Label>
                    <Input type="password" placeholder="Tu contraseña actual" className="rounded-xl bg-white/50" value={passwordForm.currentPassword}
                      onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Nueva contraseña</Label>
                    <Input type="password" placeholder="Mínimo 6 caracteres" className="rounded-xl bg-white/50" value={passwordForm.newPassword}
                      onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} required minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirmar nueva contraseña</Label>
                    <Input type="password" placeholder="Repite la nueva contraseña" className="rounded-xl bg-white/50" value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} required />
                  </div>
                  <Button type="submit" disabled={savingPassword} className="rounded-xl w-full">
                    {savingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Actualizar contraseña
                  </Button>
                </form>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL: Agregar/Editar Horario */}
      <Dialog open={slotModalOpen} onOpenChange={open => { setSlotModalOpen(open); if (!open) setEditingSlot(null); }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {editingSlot ? "Editar Horario" : "Nuevo Horario Disponible"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSlotSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inicio</Label>
                <Input type="datetime-local" className="rounded-xl bg-white/50" value={slotForm.startTime}
                  onChange={e => setSlotForm(f => ({ ...f, startTime: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fin</Label>
                <Input type="datetime-local" className="rounded-xl bg-white/50" value={slotForm.endTime}
                  onChange={e => setSlotForm(f => ({ ...f, endTime: e.target.value }))} required />
              </div>
            </div>

            {/* Availability toggle */}
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-secondary/20">
              <button
                type="button"
                onClick={() => setSlotForm(f => ({ ...f, isAvailable: !f.isAvailable }))}
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${slotForm.isAvailable ? 'bg-teal-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${slotForm.isAvailable ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-sm font-medium">{slotForm.isAvailable ? 'Disponible' : 'No disponible'}</p>
                <p className="text-xs text-muted-foreground">{slotForm.isAvailable ? 'Este horario aparece libre para citas' : 'Marcado como ocupado o bloqueado'}</p>
              </div>
              {slotForm.isAvailable
                ? <CheckCircle2 className="w-4 h-4 text-teal-500 ml-auto shrink-0" />
                : <XCircle className="w-4 h-4 text-slate-400 ml-auto shrink-0" />
              }
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notas (opcional)</Label>
              <Textarea placeholder="Ej: Sesión de 50 minutos, consulta presencial..." className="rounded-xl bg-white/50 resize-none" rows={2}
                value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <DialogFooter className="pt-2 flex-col sm:flex-row gap-2">
              {editingSlot && (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 sm:mr-auto"
                  onClick={() => { setSlotModalOpen(false); setDeletingSlot(editingSlot); }}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setSlotModalOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={createSlot.isPending || updateSlot.isPending} className="rounded-xl">
                {(createSlot.isPending || updateSlot.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingSlot ? "Guardar Cambios" : "Agregar Horario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Perfil Clínico del Paciente */}
      <Dialog open={selectedPatientId !== null} onOpenChange={open => { if (!open) { setSelectedPatientId(null); setPatientModalTab("perfil"); setFilterFrom(""); setFilterTo(""); setFilterEmocion(""); } }}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Perfil Clínico del Paciente
            </DialogTitle>
          </DialogHeader>

          {loadingPatientProfile ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : selectedPatientProfile ? (
            <div className="mt-1">
              <div className="flex items-center gap-3 pb-3 border-b border-border/50 mb-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <UserCircle className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">
                    {selectedPatientProfile.userName}
                    {(selectedPatientProfile.primerNombre || selectedPatientProfile.segundoNombre || selectedPatientProfile.apellidoPaterno || selectedPatientProfile.apellidoMaterno) && (
                      <> {[selectedPatientProfile.primerNombre, selectedPatientProfile.segundoNombre, selectedPatientProfile.apellidoPaterno, selectedPatientProfile.apellidoMaterno].filter(Boolean).join(" ")}</>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{selectedPatientProfile.userEmail}</p>
                </div>
              </div>

              <div className="flex gap-1 mb-4 bg-secondary/30 rounded-xl p-1">
                <button
                  onClick={() => setPatientModalTab("perfil")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-lg transition-all ${patientModalTab === "perfil" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <UserCircle className="w-4 h-4" /> Perfil
                </button>
                <button
                  onClick={() => setPatientModalTab("registros")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-lg transition-all ${patientModalTab === "registros" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <FileText className="w-4 h-4" /> Registros ABC
                </button>
              </div>

              {patientModalTab === "perfil" && (
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Estado" value={selectedPatientProfile.estado} />
                    <InfoField label="Perioricidad" value={selectedPatientProfile.perioricidad} />
                    <InfoField label="Costo de Terapia" value={selectedPatientProfile.costoTerapia ? `S/ ${selectedPatientProfile.costoTerapia}` : null} />
                    <InfoField label="Fecha de Alta" value={selectedPatientProfile.fechaAlta} />
                    <InfoField label="Celular" value={selectedPatientProfile.nroCelular} />
                    <InfoField label="Fecha de Nacimiento" value={selectedPatientProfile.fechaNacimiento} />
                    <InfoField label="Sexo" value={selectedPatientProfile.sexo} />
                    <InfoField label="Tipo de Documento" value={selectedPatientProfile.tipoDocumento} />
                    <InfoField label="Número de Documento" value={selectedPatientProfile.numeroDocumento} />
                    <InfoField label="País" value={selectedPatientProfile.pais} />
                  </div>
                  {(selectedPatientProfile.direccion || selectedPatientProfile.distrito || selectedPatientProfile.ciudad || selectedPatientProfile.departamento) && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dirección</p>
                      <div className="grid grid-cols-2 gap-3">
                        <InfoField label="Dirección" value={selectedPatientProfile.direccion} />
                        <InfoField label="Distrito" value={selectedPatientProfile.distrito} />
                        <InfoField label="Ciudad" value={selectedPatientProfile.ciudad} />
                        <InfoField label="Departamento" value={selectedPatientProfile.departamento} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {patientModalTab === "registros" && (
                <div className="flex flex-col gap-3">
                  <div className="space-y-2 pb-2 border-b border-border/40">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros</p>
                      {(filterFrom || filterTo || filterEmocion) && (
                        <button
                          onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterEmocion(""); }}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <X className="w-3 h-3" /> Limpiar filtros
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Desde</label>
                        <Input type="date" className="rounded-lg text-sm h-8 bg-white/50" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Hasta</label>
                        <Input type="date" className="rounded-lg text-sm h-8 bg-white/50" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Buscar por emoción (ej: ansiedad)"
                        className="rounded-lg text-sm h-8 bg-white/50 pl-8"
                        value={filterEmocion}
                        onChange={e => setFilterEmocion(e.target.value)}
                      />
                    </div>
                  </div>

                  {!loadingPatientRecords && patientRecords.length > 0 && (
                    <IntensityChart records={patientRecords} />
                  )}

                  <div className="max-h-[42vh] overflow-y-auto pr-1">
                    {loadingPatientRecords ? (
                      <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                    ) : patientRecords.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <FileText className="w-10 h-10 mx-auto mb-2 text-primary/20" />
                        <p className="text-sm">{(filterFrom || filterTo || filterEmocion) ? "No hay registros con esos filtros." : "Este paciente no tiene registros ABC aún."}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">{patientRecords.length} {patientRecords.length === 1 ? "registro" : "registros"}</p>
                        {patientRecords.map(record => (
                          <div key={record.id} className="bg-secondary/20 rounded-xl p-4 border border-border/40 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(record.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
                              </span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${record.intensidad >= 7 ? "bg-red-100 text-red-700" : record.intensidad >= 4 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                                Intensidad: {record.intensidad}/10
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <RecordField label="Situación" value={record.situacion} />
                              <RecordField label="Pensamientos" value={record.pensamientos} />
                              <RecordField label="Emoción" value={record.emocion} />
                              <RecordField label="Conducta" value={record.conducta} />
                              {record.reflexion && <RecordField label="Reflexión" value={record.reflexion} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">No se pudo cargar el perfil.</p>
          )}
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setSelectedPatientId(null); setPatientModalTab("perfil"); }} className="rounded-xl w-full">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DELETE */}
      <AlertDialog open={!!deletingSlot} onOpenChange={open => !open && setDeletingSlot(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este horario?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingSlot && deleteSlot.mutate(deletingSlot.id)}
              className="rounded-xl bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-foreground bg-secondary/30 px-3 py-2 rounded-lg">
        {value || <span className="text-muted-foreground italic">No registrado</span>}
      </p>
    </div>
  );
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-foreground leading-relaxed">{value}</p>
    </div>
  );
}

interface IntensityChartPoint {
  date: string;
  fullDate: string;
  intensidad: number;
  emocion: string;
}

function IntensityTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as IntensityChartPoint;
  return (
    <div style={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", padding: "6px 10px" }}>
      <p className="font-semibold mb-0.5">{point.fullDate}</p>
      <p>{point.intensidad}/10 — {point.emocion}</p>
    </div>
  );
}

function IntensityChart({ records }: { records: AbcRecord[] }) {
  const data: IntensityChartPoint[] = [...records]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(r => ({
      date: format(new Date(r.createdAt), "dd/MM", { locale: es }),
      fullDate: format(new Date(r.createdAt), "d MMM yyyy", { locale: es }),
      intensidad: r.intensidad,
      emocion: r.emocion,
    }));

  return (
    <div className="bg-secondary/10 border border-border/40 rounded-xl p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Evolución de Intensidad Emocional</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <ReferenceLine y={7} stroke="hsl(var(--destructive))" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={<IntensityTooltip />} />
          <Line
            type="monotone"
            dataKey="intensidad"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-right mt-1">La línea roja punteada indica intensidad alta (≥7)</p>
    </div>
  );
}

function SlotCard({ slot, onEdit, onDelete, past }: { slot: AvailabilitySlot; onEdit: (s: AvailabilitySlot) => void; onDelete: (s: AvailabilitySlot) => void; past?: boolean }) {
  const LIMA_H = 5;
  const pad = (n: number) => String(n).padStart(2, '0');
  const shiftedStart = new Date(parseISO(slot.startTime).getTime() - LIMA_H * 3_600_000);
  const shiftedEnd   = new Date(parseISO(slot.endTime).getTime()   - LIMA_H * 3_600_000);
  const durationMin  = Math.round((parseISO(slot.endTime).getTime() - parseISO(slot.startTime).getTime()) / 60000);
  const startHHmm = `${pad(shiftedStart.getUTCHours())}:${pad(shiftedStart.getUTCMinutes())}`;
  const endHHmm   = `${pad(shiftedEnd.getUTCHours())}:${pad(shiftedEnd.getUTCMinutes())}`;
  const dayLabel  = `${shiftedStart.getUTCFullYear()}-${pad(shiftedStart.getUTCMonth()+1)}-${pad(shiftedStart.getUTCDate())}`;

  return (
    <div className="glass-panel rounded-xl p-4 border flex flex-wrap gap-3 items-start justify-between hover:shadow-md transition-shadow">
      <div className="flex gap-3 items-start">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">
            {format(new Date(dayLabel + 'T12:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
          <p className="text-sm text-muted-foreground">
            {startHHmm} — {endHHmm} <span className="ml-1 text-xs">({durationMin} min)</span>
          </p>
          {slot.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{slot.notes}"</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {slot.isAvailable
          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Disponible</span>
          : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3" /> No disponible</span>
        }
        {!past && (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary hover:bg-primary/10" onClick={() => onEdit(slot)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10" onClick={() => onDelete(slot)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
