import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bell, Trash2, Eye, ClipboardList, Loader2, Megaphone, MailOpen,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────
interface PatientMessage {
  id: number;
  body: string;
  assignmentId: number | null;
  taskName: string | null;
  psicologoName: string | null;
  readAt: string | null;
  editedAt: string | null;
  createdAt: string;
}

const fmtDate = (iso: string) =>
  format(new Date(iso), "d 'de' MMMM yyyy, HH:mm", { locale: es });

const POLL_MS = 20_000;

// Paleta: oliva #ABAE84 · azul #AEC8D2 · mostaza #D4AE7F · crema #F2EADF · rosa #EBC1BC · tinta #333333
export function PatientNotifications() {
  const qc = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(false);
  const [detail, setDetail] = useState<PatientMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientMessage | null>(null);

  const { data: messages = [] } = useQuery<PatientMessage[]>({
    queryKey: ["patient-messages"],
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const r = await fetch("/api/mensajes/mine");
      if (!r.ok) throw new Error("No se pudieron cargar los mensajes");
      return r.json();
    },
  });

  const unread = useMemo(() => messages.filter((m) => !m.readAt), [messages]);
  const popupMessage = unread.length > 0 ? unread[unread.length - 1] : null; // el más antiguo sin leer

  const invalidate = () => qc.invalidateQueries({ queryKey: ["patient-messages"] });

  const readMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/mensajes/mine/${id}/read`, { method: "POST" });
      if (!r.ok) throw new Error("Error al marcar como leído");
      return r.json();
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/mensajes/mine/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Error al eliminar");
      return r.json();
    },
    onSuccess: () => { setDeleteTarget(null); setDetail(null); invalidate(); },
  });

  const openDetail = (m: PatientMessage) => {
    setDetail(m);
    if (!m.readAt) readMut.mutate(m.id);
  };

  return (
    <>
      {/* ── Campanita con contador ── */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground rounded-full"
            title="Mensajes de tu psicóloga"
          >
            <Bell className="h-5 w-5" />
            {unread.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
                aria-label={`${unread.length} mensajes sin leer`}
              >
                {unread.length > 9 ? "9+" : unread.length}
              </span>
            )}
          </Button>
        </SheetTrigger>

        {/* ── Panel lateral derecho ── */}
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg" style={{ backgroundColor: "#F2EADF" }}>
                <Megaphone className="w-4 h-4" style={{ color: "#ABAE84" }} />
              </div>
              Mensajes de tu psicóloga
            </SheetTitle>
            <SheetDescription>
              Aquí encontrarás los anuncios y recordatorios que te envía tu psicóloga.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <MailOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No tienes mensajes por ahora.
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="group relative rounded-xl border p-3.5 transition-shadow hover:shadow-sm cursor-pointer"
                  style={{
                    backgroundColor: m.readAt ? "#FFFFFF" : "#F2EADF",
                    borderColor: m.readAt ? "#AEC8D255" : "#D4AE7F66",
                  }}
                  onClick={() => openDetail(m)}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
                    <span>{fmtDate(m.createdAt)}</span>
                    {!m.readAt && (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                        Nuevo
                      </span>
                    )}
                    {m.taskName && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: "#AEC8D240", color: "#333333" }}
                      >
                        <ClipboardList className="w-3 h-3" /> {m.taskName}
                      </span>
                    )}
                  </div>
                  {m.psicologoName && (
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#ABAE84" }}>
                      {m.psicologoName}
                    </p>
                  )}
                  <p className="text-sm text-foreground line-clamp-2 whitespace-pre-wrap break-words pr-14">
                    {m.body}
                  </p>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="icon" title="Leer mensaje"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground bg-white/80"
                      onClick={(e) => { e.stopPropagation(); openDetail(m); }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" title="Eliminar de mi panel"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive bg-white/80"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(m); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Pop-up centrado al llegar un mensaje nuevo ── */}
      <Dialog open={!!popupMessage && !panelOpen && !detail}>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden border-0 shadow-2xl"
          style={{ backgroundColor: "#F2EADF" }}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {popupMessage && (
            <>
              <DialogHeader>
                <div
                  className="mx-auto mb-2 w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#ABAE84" }}
                >
                  <Megaphone className="w-6 h-6 text-white" />
                </div>
                <DialogTitle className="text-center" style={{ color: "#333333" }}>
                  Tienes un mensaje de tu psicóloga
                </DialogTitle>
                <DialogDescription className="text-center">
                  {popupMessage.psicologoName ? `De ${popupMessage.psicologoName} · ` : ""}
                  {fmtDate(popupMessage.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl bg-white p-4 border" style={{ borderColor: "#D4AE7F55" }}>
                {popupMessage.taskName && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mb-2"
                    style={{ backgroundColor: "#AEC8D240", color: "#333333" }}
                  >
                    <ClipboardList className="w-3 h-3" /> Tarea: {popupMessage.taskName}
                  </span>
                )}
                <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "#333333" }}>
                  {popupMessage.body}
                </p>
              </div>
              <DialogFooter className="sm:justify-center">
                <Button
                  onClick={() => readMut.mutate(popupMessage.id)}
                  disabled={readMut.isPending}
                  className="text-white px-8"
                  style={{ backgroundColor: "#ABAE84" }}
                >
                  {readMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Entendido
                </Button>
              </DialogFooter>
              {unread.length > 1 && (
                <p className="text-center text-xs text-muted-foreground -mt-1">
                  Tienes {unread.length - 1} mensaje{unread.length - 1 === 1 ? "" : "s"} más sin leer
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Releer mensaje (detalle) ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4" style={{ color: "#ABAE84" }} />
                  Mensaje de tu psicóloga
                </DialogTitle>
                <DialogDescription>
                  {detail.psicologoName ? `De ${detail.psicologoName} · ` : ""}
                  {fmtDate(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl p-4 border" style={{ backgroundColor: "#F2EADF", borderColor: "#D4AE7F55" }}>
                {detail.taskName && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mb-2 bg-white"
                    style={{ color: "#333333" }}
                  >
                    <ClipboardList className="w-3 h-3" /> Tarea: {detail.taskName}
                  </span>
                )}
                <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "#333333" }}>
                  {detail.body}
                </p>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(detail)}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                </Button>
                <Button onClick={() => setDetail(null)} className="text-white" style={{ backgroundColor: "#ABAE84" }}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminación (lógica) ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este mensaje?</AlertDialogTitle>
            <AlertDialogDescription>
              El mensaje desaparecerá de tu panel de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
