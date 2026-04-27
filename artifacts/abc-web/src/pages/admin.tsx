import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListUsers, useListAllRecords, useCreateUser, useUpdateUser, useDeleteUser,
  useGetMe, getListUsersQueryKey, getListAllRecordsQueryKey, getGetMeQueryKey, type User
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { 
  Users, Database, Plus, Pencil, Trash2, ShieldAlert, KeyRound, Loader2, Search, UserCircle, BrainCircuit,
  ClipboardList, Eye, Save
} from "lucide-react";

interface PatientProfile {
  id?: number;
  userId?: number;
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

interface AuditLog {
  id: number;
  actorId?: number | null;
  actorName?: string | null;
  action: string;
  targetTable?: string | null;
  targetId?: number | null;
  ipAddress?: string | null;
  details?: string | null;
  createdAt: string;
}

// --- Schemas ---
const userSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal('')),
  role: z.enum(["admin", "user"])
});

const psicologoSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal('')),
  dateOfBirth: z.string().optional(),
  profession: z.string().optional(),
  registrationDate: z.string().optional(),
  deregistrationDate: z.string().optional(),
  commissionPercentage: z.string().optional(),
  licenseNumber: z.string().optional(),
});

interface Psicologo {
  id: number; name: string; email: string; role: string; createdAt: string;
  profileId?: number | null;
  dateOfBirth?: string | null; profession?: string | null;
  registrationDate?: string | null; deregistrationDate?: string | null;
  commissionPercentage?: string | null; licenseNumber?: string | null;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Data Queries
  const { data: users, isLoading: loadingUsers } = useListUsers();
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  
  const { data: records, isLoading: loadingRecords } = useListAllRecords(
    selectedUserId !== "all" ? { userId: parseInt(selectedUserId) } : undefined
  );

  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  // State
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Account change state
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Form
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { role: "user" }
  });

  // Mutations
  const createMut = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Usuario creado exitosamente" });
        setUserModalOpen(false);
        reset();
      }
    }
  });

  const updateMut = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Usuario actualizado" });
        setUserModalOpen(false);
        setEditingUser(null);
        reset();
      }
    }
  });

  const deleteMut = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Usuario eliminado" });
        setUserToDelete(null);
      }
    }
  });

  // Actions
  const openCreateModal = () => {
    setEditingUser(null);
    reset({ name: "", email: "", password: "", role: "user" });
    setUserModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    reset({ name: user.name, email: user.email, password: "", role: user.role });
    setUserModalOpen(true);
  };

  const onUserSubmit = (data: z.infer<typeof userSchema>) => {
    if (editingUser) {
      const updateData = { ...data };
      if (!updateData.password) delete updateData.password;
      updateMut.mutate({ id: editingUser.id, data: updateData });
    } else {
      if (!data.password) { toast({ variant: "destructive", title: "Contraseña requerida" }); return; }
      createMut.mutate({ data: data as any });
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleSuggestPassword = async () => {
    try {
      const res = await fetch('/api/admin/suggest-password');
      const data = await res.json();
      setValue("password", data.password);
      toast({ title: "Contraseña sugerida", description: "Copiada al formulario" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al generar contraseña" });
    }
  };

  // ─── PATIENT PROFILE ─────────────────────────────────────────────────────
  const [patientProfileOpen, setPatientProfileOpen] = useState(false);
  const [profilePatient, setProfilePatient] = useState<User | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile>({});
  const [loadingPatientProfile, setLoadingPatientProfile] = useState(false);
  const [savingPatientProfile, setSavingPatientProfile] = useState(false);

  const openPatientProfile = async (user: User) => {
    setProfilePatient(user);
    setPatientProfile({});
    setPatientProfileOpen(true);
    setLoadingPatientProfile(true);
    try {
      const res = await fetch(`/api/admin/patients/${user.id}/profile`);
      if (!res.ok) throw new Error(`Error al cargar perfil (${res.status})`);
      const data = await res.json();
      if (data) setPatientProfile(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo cargar el perfil clínico' });
    } finally {
      setLoadingPatientProfile(false);
    }
  };

  const handlePatientProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profilePatient) return;
    setSavingPatientProfile(true);
    try {
      const res = await fetch(`/api/admin/patients/${profilePatient.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientProfile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setPatientProfile(data);
      toast({ title: "Perfil clínico actualizado" });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSavingPatientProfile(false);
    }
  };

  // ─── AUDIT LOGS ───────────────────────────────────────────────────────────
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditActorIdFilter, setAuditActorIdFilter] = useState('');
  const [auditFromFilter, setAuditFromFilter] = useState('');
  const [auditToFilter, setAuditToFilter] = useState('');
  const [activeTab, setActiveTab] = useState('users');
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_LIMIT = 25;

  const { data: auditData, isLoading: loadingAudit } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ['audit-logs', auditActionFilter, auditActorIdFilter, auditFromFilter, auditToFilter, auditPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (auditActionFilter) params.set('action', auditActionFilter);
      if (auditActorIdFilter) params.set('actorId', auditActorIdFilter);
      if (auditFromFilter) params.set('from', auditFromFilter);
      if (auditToFilter) params.set('to', auditToFilter);
      params.set('limit', String(AUDIT_LIMIT));
      params.set('offset', String(auditPage * AUDIT_LIMIT));
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (!res.ok) throw new Error("Error al cargar auditoría");
      return res.json();
    },
    staleTime: 0,
    enabled: activeTab === 'auditoria',
  });
  const auditLogs = auditData?.logs ?? [];
  const auditTotal = auditData?.total ?? 0;

  const ACTION_LABELS: Record<string, string> = {
    LOGIN: "Inicio de sesión",
    VIEW_OWN_PROFILE: "Vio su propio perfil",
    UPDATE_OWN_PROFILE: "Actualizó su perfil clínico",
    UPDATE_OWN_EMAIL: "Cambió su correo electrónico",
    UPDATE_OWN_PASSWORD: "Cambió su contraseña",
    VIEW_PATIENT_PROFILE: "Vio perfil de paciente",
    ADMIN_UPDATE_PATIENT_PROFILE: "Actualizó perfil de paciente",
    CREATE_USER: "Creó usuario",
    UPDATE_USER: "Actualizó usuario",
    DELETE_USER: "Eliminó usuario",
  };

  // ─── PSICÓLOGOS ─────────────────────────────────────────────────────────
  const psicologoForm = useForm<z.infer<typeof psicologoSchema>>({
    resolver: zodResolver(psicologoSchema),
    defaultValues: { name: "", email: "", password: "", dateOfBirth: "", profession: "", registrationDate: "", deregistrationDate: "", commissionPercentage: "", licenseNumber: "" }
  });

  const [psicologoModalOpen, setPsicologoModalOpen] = useState(false);
  const [editingPsicologo, setEditingPsicologo] = useState<Psicologo | null>(null);
  const [deletingPsicologo, setDeletingPsicologo] = useState<Psicologo | null>(null);

  const { data: psicologos = [], isLoading: loadingPsicologos } = useQuery<Psicologo[]>({
    queryKey: ["admin-psicologos"],
    queryFn: async () => {
      const res = await fetch("/api/admin/psychologists");
      if (!res.ok) throw new Error("Error al cargar psicólogos");
      return res.json();
    },
  });

  const createPsicologoMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/admin/psychologists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear psicólogo");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-psicologos"] }); toast({ title: "Psicólogo creado" }); setPsicologoModalOpen(false); psicologoForm.reset(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updatePsicologoMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/admin/psychologists/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al actualizar");
      return json;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-psicologos"] }); toast({ title: "Psicólogo actualizado" }); setPsicologoModalOpen(false); setEditingPsicologo(null); psicologoForm.reset(); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deletePsicologoMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/psychologists/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-psicologos"] }); toast({ title: "Psicólogo eliminado" }); setDeletingPsicologo(null); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const openCreatePsicologo = () => {
    setEditingPsicologo(null);
    psicologoForm.reset({ name: "", email: "", password: "", dateOfBirth: "", profession: "", registrationDate: "", deregistrationDate: "", commissionPercentage: "", licenseNumber: "" });
    setPsicologoModalOpen(true);
  };

  const openEditPsicologo = (p: Psicologo) => {
    setEditingPsicologo(p);
    psicologoForm.reset({ name: p.name, email: p.email, password: "", dateOfBirth: p.dateOfBirth || "", profession: p.profession || "", registrationDate: p.registrationDate || "", deregistrationDate: p.deregistrationDate || "", commissionPercentage: p.commissionPercentage || "", licenseNumber: p.licenseNumber || "" });
    setPsicologoModalOpen(true);
  };

  const onPsicologoSubmit = (data: z.infer<typeof psicologoSchema>) => {
    if (editingPsicologo) {
      updatePsicologoMut.mutate({ id: editingPsicologo.id, data });
    } else {
      createPsicologoMut.mutate(data);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground">Panel de Administración</h1>
          <p className="text-muted-foreground mt-1">Gestiona usuarios y revisa todos los registros emocionales del sistema.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-5 p-1 bg-white/50 border backdrop-blur-md rounded-xl h-auto">
            <TabsTrigger value="users" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Users className="w-4 h-4 mr-1.5" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="records" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Database className="w-4 h-4 mr-1.5" /> Registros
            </TabsTrigger>
            <TabsTrigger value="psicologos" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <BrainCircuit className="w-4 h-4 mr-1.5" /> Psicólogos
            </TabsTrigger>
            <TabsTrigger value="auditoria" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <ClipboardList className="w-4 h-4 mr-1.5" /> Auditoría
            </TabsTrigger>
            <TabsTrigger value="account" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <UserCircle className="w-4 h-4 mr-1.5" /> Mi Cuenta
            </TabsTrigger>
          </TabsList>

          {/* USERS TAB */}
          <TabsContent value="users" className="mt-6">
            <div className="glass-panel rounded-[2rem] overflow-hidden shadow-lg border">
              <div className="p-6 flex justify-between items-center border-b border-border/50 bg-white/40">
                <h2 className="text-xl font-display font-semibold">Directorio de Pacientes y Staff</h2>
                <Button onClick={openCreateModal} className="rounded-full shadow-md shadow-primary/20">
                  <Plus className="w-4 h-4 mr-2" /> Crear Usuario
                </Button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Nombre</th>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Rol</th>
                      <th className="px-6 py-4 font-semibold">Fecha Registro</th>
                      <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingUsers ? (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Cargando usuarios...</td></tr>
                    ) : users?.map((u) => (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-white/40 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{u.name}</td>
                        <td className="px-6 py-4 text-muted-foreground">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                            u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {u.role === 'admin' ? 'Admin' : 'Paciente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {format(new Date(u.createdAt), "dd/MM/yyyy", { locale: es })}
                        </td>
                        <td className="px-6 py-4 flex justify-end gap-2">
                          {u.role === 'user' && (
                            <Button variant="ghost" size="icon" title="Ver Perfil Clínico" onClick={() => openPatientProfile(u)} className="h-8 w-8 text-teal-600 hover:bg-teal-50 rounded-full">
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(u)} className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setUserToDelete(u)} className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* RECORDS TAB */}
          <TabsContent value="records" className="mt-6">
            <div className="glass-panel rounded-[2rem] overflow-hidden shadow-lg border">
              <div className="p-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b border-border/50 bg-white/40">
                <h2 className="text-xl font-display font-semibold">Visor Global de Registros ABC</h2>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="w-[200px] pl-9 rounded-full bg-white">
                        <SelectValue placeholder="Filtrar por paciente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los pacientes</SelectItem>
                        {users?.filter(u => u.role === 'user').map(u => (
                          <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {loadingRecords ? (
                  <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span>Cargando registros...</span>
                  </div>
                ) : !records?.length ? (
                  <div className="py-16 text-center text-muted-foreground">No se encontraron registros.</div>
                ) : records.map((r) => (
                  <div key={r.id} className="bg-white/60 border border-border/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-4 pb-3 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full">
                          {format(new Date(r.createdAt), "d 'de' MMMM yyyy — HH:mm", { locale: es })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                        {r.userName}
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">A</span>
                          Situación
                        </div>
                        <p className="text-sm text-muted-foreground bg-blue-50/50 p-3 rounded-xl whitespace-pre-wrap leading-relaxed">{r.situacion}</p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                          <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold shrink-0">B</span>
                          Pensamiento
                        </div>
                        <p className="text-sm text-muted-foreground bg-purple-50/50 p-3 rounded-xl italic whitespace-pre-wrap leading-relaxed">"{r.pensamientos}"</p>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold shrink-0">C</span>
                          Consecuencia
                        </div>
                        <div className="text-sm text-muted-foreground bg-teal-50/50 p-3 rounded-xl space-y-2 leading-relaxed">
                          <div className="flex justify-between items-center border-b border-border/40 pb-2">
                            <span className="font-medium text-foreground capitalize">{r.emocion}</span>
                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-bold">{r.intensidad}/10</span>
                          </div>
                          <p className="whitespace-pre-wrap">{r.conducta}</p>
                        </div>
                      </div>
                    </div>

                    {r.reflexion && (
                      <div className="mt-4 pt-4 border-t border-border/40">
                        <div className="flex items-center gap-2 font-semibold text-sm text-foreground mb-2">
                          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs">💡</span>
                          Reflexión / Pensamiento alternativo
                        </div>
                        <p className="text-sm text-muted-foreground italic bg-amber-50 p-3 rounded-xl border border-amber-100 whitespace-pre-wrap leading-relaxed">"{r.reflexion}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* PSICÓLOGOS TAB */}
          <TabsContent value="psicologos" className="mt-6">
            <div className="glass-panel rounded-[2rem] overflow-hidden shadow-lg border">
              <div className="p-6 flex justify-between items-center border-b border-border/50 bg-white/40">
                <div>
                  <h2 className="text-xl font-display font-semibold">Gestión de Psicólogos</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Registra y administra los psicólogos del sistema.</p>
                </div>
                <Button onClick={openCreatePsicologo} className="rounded-full shadow-md shadow-primary/20">
                  <Plus className="w-4 h-4 mr-2" /> Agregar Psicólogo
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Nombre</th>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Colegiatura</th>
                      <th className="px-6 py-4 font-semibold">Profesión</th>
                      <th className="px-6 py-4 font-semibold">Alta</th>
                      <th className="px-6 py-4 font-semibold">Comisión</th>
                      <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingPsicologos ? (
                      <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Cargando psicólogos...</td></tr>
                    ) : psicologos.length === 0 ? (
                      <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No hay psicólogos registrados.</td></tr>
                    ) : psicologos.map(p => (
                      <tr key={p.id} className="border-t border-border/30 hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 font-medium">{p.name}</td>
                        <td className="px-6 py-4 text-muted-foreground">{p.email}</td>
                        <td className="px-6 py-4">{p.licenseNumber || <span className="text-muted-foreground/50 text-xs italic">—</span>}</td>
                        <td className="px-6 py-4">{p.profession || <span className="text-muted-foreground/50 text-xs italic">—</span>}</td>
                        <td className="px-6 py-4 text-xs">{p.registrationDate || <span className="text-muted-foreground/50 italic">—</span>}</td>
                        <td className="px-6 py-4">{p.commissionPercentage ? `${p.commissionPercentage}%` : <span className="text-muted-foreground/50 text-xs italic">—</span>}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full text-primary border-primary/20" onClick={() => openEditPsicologo(p)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full text-destructive border-destructive/20" onClick={() => setDeletingPsicologo(p)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* AUDITORÍA TAB */}
          <TabsContent value="auditoria" className="mt-6">
            <div className="glass-panel rounded-[2rem] overflow-hidden shadow-lg border">
              <div className="p-6 border-b border-border/50 bg-white/40">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                  <div>
                    <h2 className="text-xl font-display font-semibold">Auditoría del Sistema</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Registro de acciones sensibles realizadas en el sistema.</p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full self-start" onClick={() => { setAuditActionFilter(''); setAuditActorIdFilter(''); setAuditFromFilter(''); setAuditToFilter(''); setAuditPage(0); }}>
                    Limpiar filtros
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                  <Select value={auditActionFilter || 'all'} onValueChange={v => { setAuditActionFilter(v === 'all' ? '' : v); setAuditPage(0); }}>
                    <SelectTrigger className="rounded-full bg-white">
                      <SelectValue placeholder="Filtrar por acción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las acciones</SelectItem>
                      <SelectItem value="LOGIN">Inicio de sesión</SelectItem>
                      <SelectItem value="VIEW_OWN_PROFILE">Visualización perfil propio</SelectItem>
                      <SelectItem value="UPDATE_OWN_PROFILE">Actualización perfil clínico propio</SelectItem>
                      <SelectItem value="UPDATE_OWN_EMAIL">Cambio de correo propio</SelectItem>
                      <SelectItem value="UPDATE_OWN_PASSWORD">Cambio de contraseña</SelectItem>
                      <SelectItem value="VIEW_PATIENT_PROFILE">Visualización de perfil paciente</SelectItem>
                      <SelectItem value="ADMIN_UPDATE_PATIENT_PROFILE">Actualización admin perfil</SelectItem>
                      <SelectItem value="CREATE_USER">Creación de usuario</SelectItem>
                      <SelectItem value="UPDATE_USER">Actualización de usuario</SelectItem>
                      <SelectItem value="DELETE_USER">Eliminación de usuario</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={auditActorIdFilter || 'all'} onValueChange={v => { setAuditActorIdFilter(v === 'all' ? '' : v); setAuditPage(0); }}>
                    <SelectTrigger className="rounded-full bg-white">
                      <SelectValue placeholder="Filtrar por usuario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los usuarios</SelectItem>
                      {(users ?? []).map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground pl-1">Desde</Label>
                    <Input type="date" className="rounded-full bg-white h-9 text-sm" value={auditFromFilter} onChange={e => { setAuditFromFilter(e.target.value); setAuditPage(0); }} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground pl-1">Hasta</Label>
                    <Input type="date" className="rounded-full bg-white h-9 text-sm" value={auditToFilter} onChange={e => { setAuditToFilter(e.target.value); setAuditPage(0); }} />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-secondary/50">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Fecha</th>
                      <th className="px-6 py-4 font-semibold">Actor</th>
                      <th className="px-6 py-4 font-semibold">Acción</th>
                      <th className="px-6 py-4 font-semibold">Tabla</th>
                      <th className="px-6 py-4 font-semibold">ID Objetivo</th>
                      <th className="px-6 py-4 font-semibold">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAudit ? (
                      <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando auditoría...</td></tr>
                    ) : auditLogs.length === 0 ? (
                      <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No hay registros de auditoría.</td></tr>
                    ) : auditLogs.map(log => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-white/40 transition-colors">
                        <td className="px-6 py-3 text-muted-foreground whitespace-nowrap text-xs">
                          {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                        </td>
                        <td className="px-6 py-3 font-medium text-foreground">{log.actorName || `ID ${log.actorId}`}</td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-100">
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground text-xs">{log.targetTable || '—'}</td>
                        <td className="px-6 py-3 text-muted-foreground text-xs">{log.targetId ?? '—'}</td>
                        <td className="px-6 py-3 text-muted-foreground text-xs">{log.ipAddress || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="p-4 flex justify-between items-center border-t border-border/50">
                <Button variant="outline" size="sm" className="rounded-full" disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}>
                  ← Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {auditPage + 1} · {auditTotal} registros
                </span>
                <Button variant="outline" size="sm" className="rounded-full" disabled={(auditPage + 1) * AUDIT_LIMIT >= auditTotal} onClick={() => setAuditPage(p => p + 1)}>
                  Siguiente →
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* MI CUENTA TAB */}
          <TabsContent value="account" className="mt-6">
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

              {/* Cambiar correo */}
              <div className="glass-panel p-6 rounded-2xl border">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm">@</span>
                  Cambiar correo electrónico
                </h3>
                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-new-email">Nuevo correo electrónico</Label>
                    <Input
                      id="admin-new-email"
                      type="email"
                      placeholder="nuevo@correo.com"
                      className="rounded-xl bg-white/50"
                      value={emailForm.email}
                      onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-email-curr-pass">Contraseña actual (para confirmar)</Label>
                    <Input
                      id="admin-email-curr-pass"
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
                    <Label htmlFor="admin-curr-pass">Contraseña actual</Label>
                    <Input
                      id="admin-curr-pass"
                      type="password"
                      placeholder="Tu contraseña actual"
                      className="rounded-xl bg-white/50"
                      value={passwordForm.currentPassword}
                      onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-new-pass">Nueva contraseña</Label>
                    <Input
                      id="admin-new-pass"
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
                    <Label htmlFor="admin-confirm-pass">Confirmar nueva contraseña</Label>
                    <Input
                      id="admin-confirm-pass"
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
          </TabsContent>
        </Tabs>
      </main>

      {/* CREATE/EDIT USER DIALOG */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{editingUser ? "Editar Usuario" : "Crear Usuario"}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit(onUserSubmit)} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre Completo</Label>
              <Input id="name" {...register("name")} className="rounded-xl bg-secondary/30" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input id="email" type="email" {...register("email")} className="rounded-xl bg-secondary/30" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password">Contraseña {editingUser && "(Dejar en blanco para no cambiar)"}</Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={handleSuggestPassword}>
                  <KeyRound className="w-3 h-3 mr-1" /> Sugerir segura
                </Button>
              </div>
              <Input id="password" type="text" {...register("password")} className="rounded-xl bg-secondary/30 font-mono" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            <div className="space-y-2 pb-2">
              <Label>Rol del Sistema</Label>
              <Select onValueChange={(v) => setValue("role", v as "admin" | "user")} defaultValue={editingUser?.role || "user"}>
                <SelectTrigger className="rounded-xl bg-secondary/30">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Paciente (Usuario)</SelectItem>
                  <SelectItem value="admin">Administrador (Staff)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setUserModalOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending} className="rounded-xl">
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingUser ? "Guardar Cambios" : "Crear Usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente a <strong>{userToDelete?.name}</strong> y todos sus registros ABC asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={() => userToDelete && deleteMut.mutate({ id: userToDelete.id })}
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CREATE/EDIT PSYCHOLOGIST DIALOG */}
      <Dialog open={psicologoModalOpen} onOpenChange={open => { setPsicologoModalOpen(open); if (!open) setEditingPsicologo(null); }}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingPsicologo ? "Editar Psicólogo" : "Registrar Nuevo Psicólogo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={psicologoForm.handleSubmit(onPsicologoSubmit)} className="space-y-4 mt-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre Completo *</Label>
                <Input {...psicologoForm.register("name")} className="rounded-xl bg-secondary/30" placeholder="Dr. Nombre Apellido" />
                {psicologoForm.formState.errors.name && <p className="text-xs text-destructive">{psicologoForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Correo Electrónico *</Label>
                <Input type="email" {...psicologoForm.register("email")} className="rounded-xl bg-secondary/30" placeholder="correo@ejemplo.com" />
                {psicologoForm.formState.errors.email && <p className="text-xs text-destructive">{psicologoForm.formState.errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{editingPsicologo ? "Contraseña (Dejar en blanco para no cambiar)" : "Contraseña *"}</Label>
              <Input type="text" {...psicologoForm.register("password")} className="rounded-xl bg-secondary/30 font-mono" placeholder="Mínimo 6 caracteres" />
              {psicologoForm.formState.errors.password && <p className="text-xs text-destructive">{psicologoForm.formState.errors.password.message}</p>}
            </div>
            <div className="border-t pt-4 mt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Información Profesional</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Profesión</Label>
                  <Input {...psicologoForm.register("profession")} className="rounded-xl bg-secondary/30" placeholder="Psicólogo Clínico" />
                </div>
                <div className="space-y-2">
                  <Label>Número de Colegiatura</Label>
                  <Input {...psicologoForm.register("licenseNumber")} className="rounded-xl bg-secondary/30" placeholder="PSI-12345" />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Nacimiento</Label>
                  <Input type="date" {...psicologoForm.register("dateOfBirth")} className="rounded-xl bg-secondary/30" />
                </div>
                <div className="space-y-2">
                  <Label>% de Comisión</Label>
                  <Input type="number" step="0.01" min="0" max="100" {...psicologoForm.register("commissionPercentage")} className="rounded-xl bg-secondary/30" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Alta</Label>
                  <Input type="date" {...psicologoForm.register("registrationDate")} className="rounded-xl bg-secondary/30" />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Baja (si aplica)</Label>
                  <Input type="date" {...psicologoForm.register("deregistrationDate")} className="rounded-xl bg-secondary/30" />
                </div>
              </div>
            </div>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setPsicologoModalOpen(false)} className="rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={createPsicologoMut.isPending || updatePsicologoMut.isPending} className="rounded-xl">
                {(createPsicologoMut.isPending || updatePsicologoMut.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPsicologo ? "Guardar Cambios" : "Registrar Psicólogo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE PSYCHOLOGIST CONFIRMATION */}
      <AlertDialog open={!!deletingPsicologo} onOpenChange={open => !open && setDeletingPsicologo(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar psicólogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto eliminará la cuenta de <strong>{deletingPsicologo?.name}</strong> y todos sus datos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
              onClick={() => deletingPsicologo && deletePsicologoMut.mutate(deletingPsicologo.id)}>
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* PATIENT CLINICAL PROFILE DIALOG */}
      <Dialog open={patientProfileOpen} onOpenChange={open => { setPatientProfileOpen(open); if (!open) { setProfilePatient(null); setPatientProfile({}); } }}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-teal-600" />
              Perfil Clínico — {profilePatient?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingPatientProfile ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando perfil...
            </div>
          ) : (
            <form onSubmit={handlePatientProfileSave} className="space-y-5 mt-2">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Apellido Paterno</Label>
                  <Input className="rounded-xl bg-secondary/30" value={patientProfile.apellidoPaterno || ''} onChange={e => setPatientProfile(p => ({ ...p, apellidoPaterno: e.target.value }))} placeholder="Apellido paterno" />
                </div>
                <div className="space-y-2">
                  <Label>Apellido Materno</Label>
                  <Input className="rounded-xl bg-secondary/30" value={patientProfile.apellidoMaterno || ''} onChange={e => setPatientProfile(p => ({ ...p, apellidoMaterno: e.target.value }))} placeholder="Apellido materno" />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Nacimiento</Label>
                  <Input type="date" className="rounded-xl bg-secondary/30" value={patientProfile.fechaNacimiento || ''} onChange={e => setPatientProfile(p => ({ ...p, fechaNacimiento: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Sexo</Label>
                  <Select value={patientProfile.sexo || ''} onValueChange={v => setPatientProfile(p => ({ ...p, sexo: v }))}>
                    <SelectTrigger className="rounded-xl bg-secondary/30"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="femenino">Femenino</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Documento</Label>
                  <Select value={patientProfile.tipoDocumento || ''} onValueChange={v => setPatientProfile(p => ({ ...p, tipoDocumento: v }))}>
                    <SelectTrigger className="rounded-xl bg-secondary/30"><SelectValue placeholder="Selecciona" /></SelectTrigger>
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
                  <Input className="rounded-xl bg-secondary/30" value={patientProfile.numeroDocumento || ''} onChange={e => setPatientProfile(p => ({ ...p, numeroDocumento: e.target.value }))} placeholder="N° de documento" />
                </div>
                <div className="space-y-2">
                  <Label>Celular</Label>
                  <Input className="rounded-xl bg-secondary/30" value={patientProfile.nroCelular || ''} onChange={e => setPatientProfile(p => ({ ...p, nroCelular: e.target.value }))} placeholder="999 888 777" />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={patientProfile.estado || 'activo'} onValueChange={v => setPatientProfile(p => ({ ...p, estado: v }))}>
                    <SelectTrigger className="rounded-xl bg-secondary/30"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dirección</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Dirección</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.direccion || ''} onChange={e => setPatientProfile(p => ({ ...p, direccion: e.target.value }))} placeholder="Av. / Jr. / Calle..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Distrito</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.distrito || ''} onChange={e => setPatientProfile(p => ({ ...p, distrito: e.target.value }))} placeholder="Distrito" />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciudad</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.ciudad || ''} onChange={e => setPatientProfile(p => ({ ...p, ciudad: e.target.value }))} placeholder="Ciudad" />
                  </div>
                  <div className="space-y-2">
                    <Label>Departamento</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.departamento || ''} onChange={e => setPatientProfile(p => ({ ...p, departamento: e.target.value }))} placeholder="Departamento" />
                  </div>
                  <div className="space-y-2">
                    <Label>País</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.pais || 'Perú'} onChange={e => setPatientProfile(p => ({ ...p, pais: e.target.value }))} placeholder="País" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Información Terapéutica</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Perioricidad de Sesiones</Label>
                    <Select value={patientProfile.perioricidad || ''} onValueChange={v => setPatientProfile(p => ({ ...p, perioricidad: v }))}>
                      <SelectTrigger className="rounded-xl bg-secondary/30"><SelectValue placeholder="Selecciona" /></SelectTrigger>
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
                    <Input type="date" className="rounded-xl bg-secondary/30" value={patientProfile.fechaAlta || ''} onChange={e => setPatientProfile(p => ({ ...p, fechaAlta: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Psicóloga Asignada</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.psicologaAsignada || ''} onChange={e => setPatientProfile(p => ({ ...p, psicologaAsignada: e.target.value }))} placeholder="Nombre de la psicóloga" />
                  </div>
                  <div className="space-y-2">
                    <Label>Costo de Terapia (S/.)</Label>
                    <Input className="rounded-xl bg-secondary/30" value={patientProfile.costoTerapia || ''} onChange={e => setPatientProfile(p => ({ ...p, costoTerapia: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setPatientProfileOpen(false)} className="rounded-xl">Cerrar</Button>
                <Button type="submit" disabled={savingPatientProfile} className="rounded-xl bg-teal-600 hover:bg-teal-700">
                  {savingPatientProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar Perfil
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
