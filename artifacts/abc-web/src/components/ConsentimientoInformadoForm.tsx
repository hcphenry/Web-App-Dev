import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck, Loader2, FileText, Lock, ScrollText, AlertCircle, CheckCircle2 } from "lucide-react";

interface Props {
  assignmentId?: number | null;
  onCancel: () => void;
  onSaved: () => void;
}

interface ExistingRecord {
  id: number;
  acceptedAt: string | null;
  fullName: string;
  documentType: string;
  documentNumber: string;
  consentVersion: string;
}

export default function ConsentimientoInformadoForm({ assignmentId, onCancel, onSaved }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [loadingText, setLoadingText] = useState(true);
  const [consentText, setConsentText] = useState<string>("");
  const [consentVersion, setConsentVersion] = useState<string>("");
  const [existing, setExisting] = useState<ExistingRecord | null>(null);
  const [readToBottom, setReadToBottom] = useState(false);

  const [fullName, setFullName] = useState("");
  const [documentType, setDocumentType] = useState<"DNI" | "CE" | "PASAPORTE">("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/consentimiento-informado/text").then(r => r.ok ? r.json() : Promise.reject()),
      fetch("/api/consentimiento-informado/mine").then(r => r.ok ? r.json() : null),
    ])
      .then(([t, mine]) => {
        if (!active) return;
        setConsentText(t.text);
        setConsentVersion(t.version);
        if (mine) setExisting(mine);
      })
      .catch(() => {
        toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el consentimiento. Intenta nuevamente." });
      })
      .finally(() => { if (active) setLoadingText(false); });
    return () => { active = false; };
  }, [toast]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setReadToBottom(true);
  }

  const canSubmit = !existing && readToBottom && accepted &&
    fullName.trim().length >= 3 && documentNumber.trim().length >= 6 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/consentimiento-informado/mine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignmentId ?? null,
          accepted: true,
          fullName: fullName.trim(),
          documentType,
          documentNumber: documentNumber.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo guardar el consentimiento");
      }
      toast({ title: "Consentimiento aceptado", description: "Quedó registrado en tu historia clínica electrónica." });
      await queryClient.invalidateQueries({ queryKey: ["mine-tasks"] });
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e?.message ?? "Error desconocido" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="rounded-3xl bg-gradient-to-br from-sky-500 to-blue-600 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 backdrop-blur p-3 rounded-2xl shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-display font-bold leading-tight">Consentimiento Informado</h2>
            <p className="text-white/90 text-sm mt-1 leading-snug">
              Tratamiento de información digital en salud mental · Centro Psicológico ABC Positivamente · Lima, Perú
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="text-[11px] uppercase tracking-wider bg-white/20 px-2 py-1 rounded-full inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Ley N.° 29733
              </span>
              <span className="text-[11px] uppercase tracking-wider bg-white/20 px-2 py-1 rounded-full inline-flex items-center gap-1">
                <FileText className="w-3 h-3" /> MINSA · Ley 30024
              </span>
              {consentVersion && (
                <span className="text-[11px] uppercase tracking-wider bg-white/20 px-2 py-1 rounded-full">
                  Versión {consentVersion}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {existing ? (
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border-emerald-200">
          <div className="flex items-start gap-4">
            <div className="bg-emerald-100 text-emerald-700 p-3 rounded-2xl shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-display font-semibold text-foreground">
                Ya aceptaste el consentimiento informado
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Aceptado el{" "}
                {existing.acceptedAt ? new Date(existing.acceptedAt).toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" }) : "—"}.
              </p>
              <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm">
                <InfoBox label="Nombre" value={existing.fullName} />
                <InfoBox label="Documento" value={`${existing.documentType} ${existing.documentNumber}`} />
                <InfoBox label="Versión aceptada" value={existing.consentVersion} />
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Si necesitas revocar tu consentimiento o modificar tus datos, escribe al Centro Psicológico o usa el formulario de reclamaciones.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button variant="outline" onClick={onCancel} className="rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver al inicio
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="glass-panel rounded-3xl p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
              <ScrollText className="w-4 h-4 text-sky-600" />
              Lee el documento completo antes de aceptar
            </div>
            {loadingText ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando consentimiento…
              </div>
            ) : (
              <div
                onScroll={handleScroll}
                className="max-h-80 overflow-y-auto pr-3 text-sm leading-relaxed text-foreground whitespace-pre-wrap rounded-2xl bg-white/60 border border-sky-100 p-4"
                data-testid="consent-text-scroll"
              >
                {consentText}
              </div>
            )}
            {!loadingText && !readToBottom && (
              <p className="text-xs text-amber-700 mt-2 inline-flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Desplázate hasta el final del documento para poder aceptarlo.
              </p>
            )}
            {readToBottom && (
              <p className="text-xs text-emerald-700 mt-2 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Has leído el documento completo.
              </p>
            )}
          </div>

          <div className="glass-panel rounded-3xl p-5 sm:p-6">
            <h3 className="font-display font-semibold text-foreground mb-1">Tus datos para la firma electrónica</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Estos datos quedarán registrados como evidencia legal de tu aceptación.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="ci-fullname">Nombre completo</Label>
                <Input
                  id="ci-fullname"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Como aparece en tu documento"
                  className="mt-1"
                  data-testid="input-fullname"
                />
              </div>
              <div>
                <Label htmlFor="ci-doctype">Tipo de documento</Label>
                <Select value={documentType} onValueChange={v => setDocumentType(v as any)}>
                  <SelectTrigger id="ci-doctype" className="mt-1" data-testid="select-doctype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="CE">Carné de Extranjería</SelectItem>
                    <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ci-docnum">Número de documento</Label>
                <Input
                  id="ci-docnum"
                  value={documentNumber}
                  onChange={e => setDocumentNumber(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                  placeholder="Ej. 12345678"
                  inputMode="numeric"
                  className="mt-1"
                  data-testid="input-docnum"
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-sky-50 border border-sky-200 p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={accepted}
                  onCheckedChange={v => setAccepted(v === true)}
                  disabled={!readToBottom}
                  className="mt-1"
                  data-testid="checkbox-accept"
                />
                <span className="text-sm text-foreground leading-snug">
                  He leído y comprendo el consentimiento informado. <strong>Acepto libre, voluntaria, informada e inequívocamente</strong>{" "}
                  el tratamiento de mis datos personales y de salud mental por el Centro Psicológico ABC Positivamente, conforme a la Ley N.° 29733 y la normativa del MINSA.
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
              <Button variant="outline" onClick={onCancel} className="rounded-full" data-testid="btn-cancel">
                <ArrowLeft className="w-4 h-4 mr-2" /> Volver
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90"
                data-testid="btn-accept-consent"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4 mr-2" /> Aceptar y firmar electrónicamente</>
                )}
              </Button>
            </div>
            {!canSubmit && !submitting && (
              <p className="text-xs text-muted-foreground mt-3 text-right">
                {!readToBottom ? "Desplázate hasta el final del documento." :
                  !accepted ? "Marca la casilla de aceptación." :
                  fullName.trim().length < 3 ? "Ingresa tu nombre completo." :
                  documentNumber.trim().length < 6 ? "Ingresa un número de documento válido." :
                  ""}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
      <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">{label}</div>
      <div className="text-sm text-foreground mt-1 break-words">{value}</div>
    </div>
  );
}
