import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, Heart, CloudRain, Minus, Sparkles, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Tipo = "positivo" | "negativo" | "neutral";

interface Evento {
  id: string;
  edad: string;
  titulo: string;
  descripcion?: string;
  tipo: Tipo;
  emocion?: string;
  aprendizaje?: string;
}

interface LineaVidaRow {
  id: number;
  pacienteId: number;
  pacienteName?: string | null;
  pacienteEmail?: string | null;
  presenteCircunstancias: string | null;
  reflexionPatrones: string | null;
  fortalezasVitales: string | null;
  aprendizajesGenerales: string | null;
  eventos: Evento[];
  createdAt: string;
  updatedAt: string;
}

const TIPO_META: { [K in Tipo]: { label: string; chip: string; dot: string; icon: any } } = {
  positivo: { label: "Positivo", chip: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-gradient-to-br from-emerald-400 to-teal-500", icon: Heart },
  negativo: { label: "Difícil",  chip: "bg-rose-100 text-rose-700 border-rose-200",          dot: "bg-gradient-to-br from-rose-400 to-red-500",     icon: CloudRain },
  neutral:  { label: "Neutro",   chip: "bg-slate-100 text-slate-700 border-slate-200",       dot: "bg-gradient-to-br from-slate-300 to-slate-400",  icon: Minus },
};

interface Props {
  pacienteId: number;
  pacienteName?: string | null;
  open: boolean;
  onClose: () => void;
}

export default function LineaVidaViewer({ pacienteId, pacienteName, open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<LineaVidaRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/linea-vida?pacienteId=${pacienteId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar")))
      .then((rows: LineaVidaRow[]) => {
        if (!active) return;
        setRecords(rows ?? []);
        setActiveIdx(0);
      })
      .catch((e) => { if (active) setError(e?.message ?? "Error desconocido"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, pacienteId]);

  const active = records[activeIdx] ?? null;
  const sortedEventos = useMemo(() => {
    if (!active) return [];
    return [...active.eventos].sort((a, b) => {
      const ea = parseInt(a.edad), eb = parseInt(b.edad);
      if (Number.isNaN(ea) && Number.isNaN(eb)) return 0;
      if (Number.isNaN(ea)) return 1;
      if (Number.isNaN(eb)) return -1;
      return ea - eb;
    });
  }, [active]);

  const stats = useMemo(() => active ? ({
    total: active.eventos.length,
    positivos: active.eventos.filter(e => e.tipo === "positivo").length,
    negativos: active.eventos.filter(e => e.tipo === "negativo").length,
    neutrales: active.eventos.filter(e => e.tipo === "neutral").length,
  }) : { total: 0, positivos: 0, negativos: 0, neutrales: 0 }, [active]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-violet-600" />
            Línea de Vida {pacienteName ? `· ${pacienteName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Vista de sólo lectura para revisión clínica. El paciente sigue siendo el único que puede modificarla.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-rose-600 text-sm">{error}</div>
        ) : records.length === 0 ? (
          <div className="text-center py-10">
            <Eye className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-muted-foreground">Este paciente todavía no ha guardado una Línea de Vida.</p>
          </div>
        ) : active && (
          <div className="space-y-5">
            {records.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {records.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition ${i === activeIdx
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                  >
                    Versión #{records.length - i} · {format(new Date(r.createdAt), "d MMM yyyy", { locale: es })}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-2xl border bg-gradient-to-r from-violet-50 via-fuchsia-50 to-pink-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Guardada el {format(new Date(active.createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
                  {active.updatedAt !== active.createdAt && (
                    <> · Actualizada el {format(new Date(active.updatedAt), "d MMM yyyy, HH:mm", { locale: es })}</>
                  )}
                </div>
                <div className="flex gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">● {stats.positivos} positivos</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">● {stats.negativos} difíciles</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">● {stats.neutrales} neutros</span>
                </div>
              </div>
            </div>

            {active.presenteCircunstancias && (
              <Block title="Tu presente">
                <p className="text-sm text-foreground whitespace-pre-wrap">{active.presenteCircunstancias}</p>
              </Block>
            )}

            <Block title={`Eventos (${sortedEventos.length})`}>
              <ol className="space-y-2">
                {sortedEventos.map(ev => {
                  const meta = TIPO_META[ev.tipo] ?? TIPO_META.neutral;
                  const Icon = meta.icon;
                  return (
                    <li key={ev.id} className="rounded-xl border bg-white/70 p-3 flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg ${meta.dot} flex items-center justify-center text-white shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{ev.edad} a</span>
                          <h4 className="font-semibold text-sm text-foreground">{ev.titulo}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span>
                        </div>
                        {ev.descripcion && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{ev.descripcion}</p>}
                        <div className="flex flex-wrap gap-3 mt-1.5 text-[11px]">
                          {ev.emocion && <span className="text-slate-600"><b className="text-slate-700">Emoción:</b> {ev.emocion}</span>}
                          {ev.aprendizaje && <span className="text-slate-600"><b className="text-slate-700">Aprendizaje:</b> {ev.aprendizaje}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Block>

            {(active.reflexionPatrones || active.fortalezasVitales || active.aprendizajesGenerales) && (
              <div className="grid sm:grid-cols-3 gap-3">
                {active.reflexionPatrones && <Block title="Patrones"><p className="text-xs text-muted-foreground whitespace-pre-wrap">{active.reflexionPatrones}</p></Block>}
                {active.fortalezasVitales && <Block title="Fortalezas"><p className="text-xs text-muted-foreground whitespace-pre-wrap">{active.fortalezasVitales}</p></Block>}
                {active.aprendizajesGenerales && <Block title="Aprendizajes"><p className="text-xs text-muted-foreground whitespace-pre-wrap">{active.aprendizajesGenerales}</p></Block>}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={onClose} className="rounded-full">Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white/60 p-4">
      <h4 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-violet-500" />
        {title}
      </h4>
      {children}
    </div>
  );
}
