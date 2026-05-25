import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Circle as CircleIcon, ChevronLeft, ChevronRight, TrendingUp, Maximize2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

const PALETTE = {
  oliva: "#ABAE84", azul: "#AEC8D2", mostaza: "#D4AE7F",
  crema: "#F2EADF", rosa: "#EBC1BC", tinta: "#333333",
};

const AREAS_ORDER: { key: string; numero: string; titulo: string }[] = [
  { key: "salud-mental-bienestar", numero: "1", titulo: "Salud mental y bienestar" },
  { key: "salud-energia-fisica",   numero: "2", titulo: "Salud / Energía física" },
  { key: "carrera-profesion",      numero: "3", titulo: "Carrera / Profesión" },
  { key: "finanzas",               numero: "4", titulo: "Finanzas" },
  { key: "relaciones-amigos",      numero: "5", titulo: "Relaciones / Amigos" },
  { key: "familia",                numero: "6", titulo: "Familia" },
  { key: "amor-pareja",            numero: "7", titulo: "Amor / Pareja" },
  { key: "ocio-diversion",         numero: "8", titulo: "Ocio / Diversión" },
  { key: "desarrollo-personal",    numero: "9", titulo: "Desarrollo Personal" },
  { key: "entorno-fisico",         numero: "10", titulo: "Entorno Físico" },
];
const AREA_BY_KEY = new Map(AREAS_ORDER.map(a => [a.key, a]));

interface ItemSub { label: string; score: number }
interface ItemValue { key: string; score: number; subitems?: ItemSub[] }
interface Row {
  id: number; pacienteId: number; pacienteName?: string | null; pacienteEmail?: string | null;
  items: ItemValue[]; notas: string | null;
  accionSemilla: string | null; accionSemillaArea: string | null; accionSemillaFecha: string | null;
  createdAt: string; updatedAt: string;
}

interface Props {
  pacienteId: number;
  pacienteName?: string | null;
  open: boolean;
  onClose: () => void;
}

function radarDataFromItems(items: ItemValue[]) {
  const map = new Map(items.map(it => [it.key, it.score]));
  return AREAS_ORDER.map(a => ({
    area: a.titulo,
    short: a.numero,
    score: map.get(a.key) ?? 0,
    fullMark: 10,
  }));
}

export default function RuedaVidaViewer({ pacienteId, pacienteName, open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [showEvolution, setShowEvolution] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setShowEvolution(false);
    setMaximized(false);
    fetch(`/api/rueda-vida?pacienteId=${pacienteId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar")))
      .then((data: Row[]) => { if (active) { setRows(data ?? []); setIdx(0); } })
      .catch(e => { if (active) setError(e?.message ?? "Error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, pacienteId]);

  const active = rows[idx] ?? null;
  const radarData = useMemo(() => radarDataFromItems(active?.items ?? []), [active]);
  const evolution = useMemo(() => {
    return [...rows]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(r => {
        const m = new Map(r.items.map(it => [it.key, it.score]));
        const avg = r.items.length ? r.items.reduce((s, it) => s + it.score, 0) / r.items.length : 0;
        const point: any = {
          fecha: format(new Date(r.createdAt), "d MMM yy", { locale: es }),
          promedio: Math.round(avg * 10) / 10,
        };
        for (const a of AREAS_ORDER) point[a.numero] = m.get(a.key) ?? 0;
        return point;
      });
  }, [rows]);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display" style={{ color: PALETTE.tinta }}>
            <CircleIcon className="w-5 h-5" />
            La Rueda de la Vida
          </DialogTitle>
          <DialogDescription>
            Registros llenados por <span className="font-medium">{pacienteName ?? `Paciente #${pacienteId}`}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : error ? (
          <p className="text-rose-600 text-sm">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">El paciente aún no ha llenado esta tarea.</p>
        ) : active && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-3 flex-wrap gap-2"
                 style={{ background: PALETTE.crema, borderColor: PALETTE.azul + "66" }}>
              <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))} className="rounded-full">
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <div className="text-sm font-medium" style={{ color: PALETTE.tinta }}>
                {format(new Date(active.createdAt), "d 'de' MMMM, yyyy · HH:mm", { locale: es })}
                <span className="ml-2 text-xs opacity-70">({idx + 1} de {rows.length})</span>
              </div>
              <div className="flex gap-2">
                {rows.length >= 2 && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShowEvolution(s => !s)}>
                    <TrendingUp className="w-4 h-4 mr-1" /> {showEvolution ? "Ocultar" : "Ver"} evolución
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={idx === rows.length - 1} onClick={() => setIdx(i => Math.min(rows.length - 1, i + 1))} className="rounded-full">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border p-4 relative" style={{ background: "white", borderColor: PALETTE.azul + "55" }}>
              <Button size="sm" variant="ghost" className="absolute top-2 right-2 rounded-full" onClick={() => setMaximized(true)} title="Ampliar">
                <Maximize2 className="w-4 h-4" />
              </Button>
              <div style={{ width: "100%", height: 380 }}>
                <ResponsiveContainer>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="78%">
                    <PolarGrid stroke={PALETTE.tinta + "33"} />
                    <PolarAngleAxis dataKey="area" tick={{ fill: PALETTE.tinta, fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 10]} tick={{ fill: PALETTE.tinta + "88", fontSize: 10 }} />
                    <Radar dataKey="score" stroke={PALETTE.oliva} fill={PALETTE.oliva} fillOpacity={0.5} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {showEvolution && evolution.length >= 2 && (
              <div className="rounded-2xl border p-4" style={{ background: "white", borderColor: PALETTE.azul + "55" }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: PALETTE.tinta }}>
                  <TrendingUp className="w-4 h-4" /> Evolución del promedio general
                </h3>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <LineChart data={evolution} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <XAxis dataKey="fecha" stroke={PALETTE.tinta} fontSize={11} />
                      <YAxis domain={[0, 10]} stroke={PALETTE.tinta} fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="promedio" stroke={PALETTE.oliva} strokeWidth={3} dot={{ r: 4, fill: PALETTE.mostaza }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2">
              {AREAS_ORDER.map(a => {
                const it = active.items.find(i => i.key === a.key);
                const score = it?.score ?? 0;
                return (
                  <div key={a.key} className="rounded-lg border p-3" style={{ borderColor: PALETTE.azul + "55" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm" style={{ color: PALETTE.tinta }}>{a.numero}. {a.titulo}</span>
                      <span className="font-bold" style={{ color: PALETTE.tinta }}>{score}/10</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: PALETTE.crema }}>
                      <div className="h-full" style={{
                        width: `${Math.max(0, Math.min(100, score * 10))}%`,
                        background: `linear-gradient(90deg, ${PALETTE.oliva}, ${PALETTE.mostaza}, ${PALETTE.rosa})`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {active.accionSemilla && (
              <div className="rounded-lg border p-3" style={{ borderColor: PALETTE.mostaza + "66", background: PALETTE.crema + "66" }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.tinta + "AA" }}>
                  Acción semilla{active.accionSemillaArea ? ` · ${AREA_BY_KEY.get(active.accionSemillaArea)?.titulo ?? ""}` : ""}
                </p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: PALETTE.tinta }}>{active.accionSemilla}</p>
                {active.accionSemillaFecha && (
                  <p className="text-xs mt-1" style={{ color: PALETTE.tinta + "99" }}>Fecha objetivo: {active.accionSemillaFecha}</p>
                )}
              </div>
            )}

            {active.notas && (
              <div className="rounded-lg border p-3" style={{ borderColor: PALETTE.azul + "66", background: "white" }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.tinta + "AA" }}>Notas del paciente</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: PALETTE.tinta }}>{active.notas}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Maximizado: el psicólogo amplía el radar del registro activo */}
    <Dialog open={maximized} onOpenChange={(v) => { if (!v) setMaximized(false); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display" style={{ color: PALETTE.tinta }}>
            <CircleIcon className="w-5 h-5" /> Rueda ampliada
          </DialogTitle>
          <DialogDescription>
            {active && format(new Date(active.createdAt), "EEEE d 'de' MMMM, yyyy · HH:mm", { locale: es })}
          </DialogDescription>
        </DialogHeader>
        {active && (
          <div style={{ width: "100%", height: 560 }}>
            <ResponsiveContainer>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="80%">
                <PolarGrid stroke={PALETTE.tinta + "33"} />
                <PolarAngleAxis dataKey="area" tick={{ fill: PALETTE.tinta, fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fill: PALETTE.tinta + "88", fontSize: 10 }} />
                <Radar dataKey="score" stroke={PALETTE.oliva} fill={PALETTE.oliva} fillOpacity={0.55} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
