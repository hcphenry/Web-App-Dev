import { useState } from "react";
import { format, parseISO, isAfter } from "date-fns";
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
import { UserCircle, CalendarDays, Plus, Pencil, Trash2, Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";

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

export default function PsicologoDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const { data: profile, isLoading: loadingProfile } = useQuery({ queryKey: ["psicologo-profile"], queryFn: fetchProfile });
  const { data: slots = [], isLoading: loadingSlots } = useQuery({ queryKey: ["psicologo-availability"], queryFn: fetchAvailability });

  // Slot form state
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<AvailabilitySlot | null>(null);
  const [slotForm, setSlotForm] = useState({ startTime: "", endTime: "", notes: "" });

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

  const openCreateSlot = () => {
    setEditingSlot(null);
    setSlotForm({ startTime: "", endTime: "", notes: "" });
    setSlotModalOpen(true);
  };

  const openEditSlot = (slot: AvailabilitySlot) => {
    setEditingSlot(slot);
    setSlotForm({
      startTime: slot.startTime.slice(0, 16),
      endTime: slot.endTime.slice(0, 16),
      notes: slot.notes || "",
    });
    setSlotModalOpen(true);
  };

  const handleSlotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSlot) {
      updateSlot.mutate({ id: editingSlot.id, data: slotForm });
    } else {
      createSlot.mutate(slotForm);
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
          <TabsList className="grid w-full max-w-xl grid-cols-3 p-1 bg-white/50 border backdrop-blur-md rounded-xl h-auto mb-6">
            <TabsTrigger value="profile" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <UserCircle className="w-4 h-4 mr-2" /> Mi Perfil
            </TabsTrigger>
            <TabsTrigger value="availability" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <CalendarDays className="w-4 h-4 mr-2" /> Disponibilidad
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
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">No se pudo cargar el perfil.</div>
            )}
          </TabsContent>

          {/* ── DISPONIBILIDAD ── */}
          <TabsContent value="availability">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">Mis Horarios Disponibles</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Registra los días y horas en que estás disponible para atender citas.</p>
                </div>
                <Button onClick={openCreateSlot} className="rounded-full shadow-md shadow-primary/20">
                  <Plus className="w-4 h-4 mr-2" /> Agregar Horario
                </Button>
              </div>

              {loadingSlots ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : slots.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center border border-dashed">
                  <CalendarDays className="w-12 h-12 text-primary/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No tienes horarios registrados. Agrega tu primer horario disponible.</p>
                  <Button onClick={openCreateSlot} className="mt-4 rounded-full">Agregar primer horario</Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {upcomingSlots.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Próximos</h3>
                      <div className="grid gap-3">
                        {upcomingSlots.map(slot => <SlotCard key={slot.id} slot={slot} onEdit={openEditSlot} onDelete={setDeletingSlot} />)}
                      </div>
                    </div>
                  )}
                  {pastSlots.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pasados</h3>
                      <div className="grid gap-3 opacity-60">
                        {pastSlots.map(slot => <SlotCard key={slot.id} slot={slot} onEdit={openEditSlot} onDelete={setDeletingSlot} past />)}
                      </div>
                    </div>
                  )}
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
            <DialogTitle className="font-display text-xl">{editingSlot ? "Editar Horario" : "Agregar Horario Disponible"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSlotSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Fecha y hora de inicio</Label>
              <Input type="datetime-local" className="rounded-xl bg-white/50" value={slotForm.startTime}
                onChange={e => setSlotForm(f => ({ ...f, startTime: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Fecha y hora de fin</Label>
              <Input type="datetime-local" className="rounded-xl bg-white/50" value={slotForm.endTime}
                onChange={e => setSlotForm(f => ({ ...f, endTime: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea placeholder="Ej: Sesión de 50 minutos, consulta presencial..." className="rounded-xl bg-white/50 resize-none" rows={2}
                value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSlotModalOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={createSlot.isPending || updateSlot.isPending} className="rounded-xl">
                {(createSlot.isPending || updateSlot.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingSlot ? "Guardar Cambios" : "Agregar Horario"}
              </Button>
            </DialogFooter>
          </form>
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

function SlotCard({ slot, onEdit, onDelete, past }: { slot: AvailabilitySlot; onEdit: (s: AvailabilitySlot) => void; onDelete: (s: AvailabilitySlot) => void; past?: boolean }) {
  const start = parseISO(slot.startTime);
  const end = parseISO(slot.endTime);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

  return (
    <div className="glass-panel rounded-xl p-4 border flex flex-wrap gap-3 items-start justify-between hover:shadow-md transition-shadow">
      <div className="flex gap-3 items-start">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground">
            {format(start, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(start, "HH:mm")} — {format(end, "HH:mm")} <span className="ml-1 text-xs">({durationMin} min)</span>
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
