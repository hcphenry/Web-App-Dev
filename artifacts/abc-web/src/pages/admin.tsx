import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListUsers, useListAllRecords, useCreateUser, useUpdateUser, useDeleteUser,
  getListUsersQueryKey, getListAllRecordsQueryKey, type User
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
import { 
  Users, Database, Plus, Pencil, Trash2, ShieldAlert, KeyRound, Loader2, Search
} from "lucide-react";

// --- Schemas ---
const userSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal('')),
  role: z.enum(["admin", "user"])
});

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Data Queries
  const { data: users, isLoading: loadingUsers } = useListUsers();
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  
  const { data: records, isLoading: loadingRecords } = useListAllRecords(
    selectedUserId !== "all" ? { userId: parseInt(selectedUserId) } : undefined
  );

  // State
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground">Panel de Administración</h1>
          <p className="text-muted-foreground mt-1">Gestiona usuarios y revisa todos los registros emocionales del sistema.</p>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-white/50 border backdrop-blur-md rounded-xl h-auto">
            <TabsTrigger value="users" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Users className="w-4 h-4 mr-2" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="records" className="rounded-lg py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Database className="w-4 h-4 mr-2" /> Registros Globales
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
    </div>
  );
}
