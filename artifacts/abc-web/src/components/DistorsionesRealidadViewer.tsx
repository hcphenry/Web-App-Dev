import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, BrainCircuit, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const PALETTE = {
  oliva: "#ABAE84", azul: "#AEC8D2", mostaza: "#D4AE7F",
  crema: "#F2EADF", rosa: "#EBC1BC", tinta: "#333333",
};

const LABELS: { [k: string]: string } = {
  "todo-o-nada": "Pensamiento del todo o nada",
  "generalizacion-excesiva": "Generalización excesiva",
  "filtro-mental": "Filtro mental",
  "descalificacion-positivo": "Descalificación de lo positivo",
  "conclusiones-precipitadas": "Conclusiones precipitadas",
  "magnificacion-catastrofizacion": "Magnificación / Catastrofización",
  "razonamiento-emocional": "Razonamiento emocional",
  "los-deberias": "Los «deberías»",
  "etiquetacion": "Etiquetación",
  "personalizacion": "Personalización",
};
const ORDER = Object.keys(LABELS);

interface ItemValue { key: string; value: number }
interface Row {
  id: number; pacienteId: number; pacienteName?: string | null; pacienteEmail?: string | null;
  items: ItemValue[]; notas: string | null; createdAt: string; updatedAt: string;
}

interface Props {
  pacienteId: number;
  pacienteName?: string | null;
  open: boolean;
  onClose: () => void;
}

export default function DistorsionesRealidadViewer({ pacienteId, pacienteName, open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/distorsiones?pacienteId=${pacienteId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar")))
      .then((data: Row[]) => { if (active) { setRows(data ?? []); setIdx(0); } })
      .catch(e => { if (active) setError(e?.message ?? "Error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, pacienteId]);

  const active = rows[idx] ?? null;
  const valueMap = new Map((active?.items ?? []).map(it => [it.key, it.value]));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display" style={{ color: PALETTE.tinta }}>
            <BrainCircuit className="w-5 h-5" />
            Distorsiones de la percepción de la realidad
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
            <div className="flex items-center justify-between rounded-xl border p-3"
                 style={{ background: PALETTE.crema, borderColor: PALETTE.azul + "66" }}>
              <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setIdx(i => Math.max(0, i - 1))} className="rounded-full">
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <div className="text-sm font-medium" style={{ color: PALETTE.tinta }}>
                {format(new Date(active.createdAt), "d 'de' MMMM, yyyy · HH:mm", { locale: es })}
                <span className="ml-2 text-xs opacity-70">({idx + 1} de {rows.length})</span>
              </div>
              <Button variant="outline" size="sm" disabled={idx === rows.length - 1} onClick={() => setIdx(i => Math.min(rows.length - 1, i + 1))} className="rounded-full">
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid gap-2">
              {ORDER.map((k) => {
                const v = valueMap.get(k) ?? 0;
                return (
                  <div key={k} className="rounded-lg border p-3" style={{ borderColor: PALETTE.azul + "55" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm" style={{ color: PALETTE.tinta }}>{LABELS[k]}</span>
                      <span className="font-bold text-base" style={{ color: PALETTE.tinta }}>{v}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: PALETTE.crema }}>
                      <div className="h-full" style={{
                        width: `${Math.max(0, Math.min(100, v))}%`,
                        background: `linear-gradient(90deg, ${PALETTE.oliva}, ${PALETTE.mostaza}, ${PALETTE.rosa})`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {active.notas && (
              <div className="rounded-lg border p-3" style={{ borderColor: PALETTE.mostaza + "66", background: PALETTE.crema + "66" }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: PALETTE.tinta + "AA" }}>Notas del paciente</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: PALETTE.tinta }}>{active.notas}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
