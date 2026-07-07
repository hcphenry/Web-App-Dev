import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Megaphone, Send, Pencil, Trash2, Loader2, ClipboardList,
  CheckCheck, Clock, Users,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────
interface AssignedPatient {
  profileId: number;
  userId: number;
  userName: string;
  userEmail: string;
  estado: string | null;
}
interface Assignment {
  id: number;
  taskName: string;
  status: string;
  assignedAt: string;
}
interface PsiMessage {
  id: number;
  pacienteId: number;
  assignmentId: number | null;
  body: string;
  readAt: string | null;
  editedAt: string | null;
  createdAt: string;
  taskName: string | null;
}

const fmtDate = (iso: string) =>
  format(new Date(iso), "d 'de' MMMM yyyy, HH:mm", { locale: es });

// Paleta: oliva #ABAE84 · azul #AEC8D2 · mostaza #D4AE7F · crema #F2EADF · rosa #EBC1BC · tinta #333333
export default function TablonAnuncios() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [pacienteId, setPacienteId] = useState<string>("");
  const [body, setBody] = useState("");
  const [assignmentId, setAssignmentId] = useState<string>("none");
  const [editTarget, setEditTarget] = useState<PsiMessage | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PsiMessage | null>(null);

  const { data: patients = [], isLoading: loadingPatients } = useQuery<AssignedPatient[]>({
    queryKey: ["psi-patients"],
    queryFn: async () => {
      const r = await fetch("/api/psicologo/patients");
      if (!r.ok) throw new Error("No se pudieron cargar los pacientes");
      return r.json();
    },
  });

  const pid = pacienteId ? Number(pacienteId) : null;

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["psi-msg-assignments", pid],
    enabled: pid !== null,
    queryFn: async () => {
      const r = await fetch(`/api/tareas/assignments?pacienteId=${pid}`);
      if (!r.ok) throw new Error("No se pudieron cargar las tareas");
      return r.json();
    },
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery<PsiMessage[]>({
    queryKey: ["psi-messages", pid],
    enabled: pid !== null,
    queryFn: async () => {
      const r = await fetch(`/api/mensajes/psi?pacienteId=${pid}`);
      if (!r.ok) throw new Error("No se pudo cargar el historial");
      return r.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["psi-messages", pid] });

  const sendMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/mensajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pacienteId: pid,
          body: body.trim(),
          assignmentId: assignmentId !== "none" ? Number(assignmentId) : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error al enviar");
      return r.json();
    },
    onSuccess: () => {
      setBody(""); setAssignmentId("none"); invalidate();
      toast({ title: "Mensaje enviado", description: "El paciente lo verá en su portal." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/mensajes/${editTarget!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error al modificar");
      return r.json();
    },
    onSuccess: () => {
      setEditTarget(null); invalidate();
      toast({ title: "Mensaje actualizado", description: "Se volverá a entregar al paciente como nuevo." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/mensajes/${deleteTarget!.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Error al eliminar");
      return r.json();
    },
    onSuccess: () => {
      setDeleteTarget(null); invalidate();
      toast({ title: "Mensaje eliminado", description: "El paciente ya no podrá verlo. Queda registrado para auditoría." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedPatient = useMemo(
    () => patients.find((p) => String(p.userId) === pacienteId) ?? null,
    [patients, pacienteId],
  );

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-2xl border">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl" style={{ backgroundColor: "#F2EADF" }}>
            <Megaphone className="w-5 h-5" style={{ color: "#ABAE84" }} />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground">Tablón de Anuncios</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Envía mensajes a tus pacientes. Puedes vincular cada mensaje a una tarea asignada.
        </p>

        <div className="mt-5 max-w-md">
          <Label className="text-sm font-medium mb-1.5 flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "#ABAE84" }} /> Paciente
          </Label>
          <Select value={pacienteId} onValueChange={(v) => { setPacienteId(v); setAssignmentId("none"); }}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder={loadingPatients ? "Cargando pacientes..." : "Selecciona un paciente"} />
            </SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.userId} value={String(p.userId)}>{p.userName}</SelectItem>
              ))}
              {!loadingPatients && patients.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No tienes pacientes asignados</div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {pid !== null && (
        <>
          {/* ── Redactar ── */}
          <div className="glass-panel p-6 rounded-2xl border" style={{ backgroundColor: "#F2EADF66" }}>
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Send className="w-4 h-4" style={{ color: "#D4AE7F" }} />
              Nuevo mensaje para {selectedPatient?.userName ?? "el paciente"}
            </h3>
            <div className="space-y-3">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escribe aquí tu mensaje..."
                rows={3}
                maxLength={4000}
                className="bg-white resize-y"
              />
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> Vincular a una tarea asignada (opcional)
                  </Label>
                  <Select value={assignmentId} onValueChange={setAssignmentId}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Sin tarea" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin tarea vinculada</SelectItem>
                      {assignments.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.taskName} · {format(new Date(a.assignedAt), "dd/MM/yyyy")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => sendMut.mutate()}
                  disabled={!body.trim() || sendMut.isPending}
                  className="text-white"
                  style={{ backgroundColor: "#ABAE84" }}
                >
                  {sendMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar
                </Button>
              </div>
            </div>
          </div>

          {/* ── Historial ── */}
          <div className="glass-panel p-6 rounded-2xl border">
            <h3 className="font-semibold text-foreground mb-4">Historial de mensajes</h3>
            {loadingMessages ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Aún no has enviado mensajes a este paciente.
              </p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className="group relative rounded-xl border p-4 transition-colors hover:shadow-sm"
                    style={{ backgroundColor: "#FFFFFF", borderColor: "#AEC8D255" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1.5">
                          <span>{fmtDate(m.createdAt)}</span>
                          {m.taskName && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: "#AEC8D240", color: "#333333" }}
                            >
                              <ClipboardList className="w-3 h-3" /> {m.taskName}
                            </span>
                          )}
                          {m.editedAt && (
                            <span
                              className="px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: "#D4AE7F33", color: "#333333" }}
                            >
                              Editado
                            </span>
                          )}
                          {m.readAt ? (
                            <span className="inline-flex items-center gap-1" style={{ color: "#ABAE84" }}>
                              <CheckCheck className="w-3.5 h-3.5" /> Leído
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> Sin leer
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost" size="icon" title="Modificar"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditTarget(m); setEditBody(m.body); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" title="Eliminar"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(m)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ── Editar ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modificar mensaje</DialogTitle>
            <DialogDescription>
              Al guardar, el mensaje se volverá a entregar al paciente como nuevo
              (aunque ya lo hubiera leído). El texto anterior queda registrado para auditoría.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            maxLength={4000}
            className="resize-y"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button
              onClick={() => editMut.mutate()}
              disabled={!editBody.trim() || editMut.isPending}
              className="text-white"
              style={{ backgroundColor: "#ABAE84" }}
            >
              {editMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Eliminar ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este mensaje?</AlertDialogTitle>
            <AlertDialogDescription>
              El paciente dejará de verlo en su portal. El mensaje no se borra
              definitivamente: queda guardado como registro para auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
