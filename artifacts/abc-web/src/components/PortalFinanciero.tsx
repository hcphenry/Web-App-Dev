import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  LayoutDashboard, Receipt, Upload, Trash2, Loader2, Search, FileSpreadsheet,
  TrendingUp, TrendingDown, Wallet, Hash, Filter, Download, Save, X, Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────
interface Transaction {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  moneda: string;
  numeroOperacion: string | null;
  banco: string;
  cuentaBancaria: string;
  usuarioId: number | null;
  usuarioTexto: string | null;
  usuarioName: string | null;
  usuarioEmail: string | null;
  createdAt: string;
}
interface Usuario { id: number; name: string; email: string; role: string; }
interface KpisResp {
  kpis: { totalIngresos: number; totalEgresos: number; balanceNeto: number; totalTransacciones: number; };
  porBanco: { banco: string; total: number; ingresos: number; egresos: number; }[];
}
interface UploadResp {
  banco: string; detectedBank: string; total: number; insertados: number; duplicados: number; omitidasInvalidas: number;
}

const fmtMoney = (n: number, moneda = "PEN") => {
  try { return new Intl.NumberFormat("es-PE", { style: "currency", currency: moneda }).format(n); }
  catch { return `${moneda || "PEN"} ${n.toFixed(2)}`; }
};
const fmtDate = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: es });

// ─── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="glass-panel rounded-2xl p-5 border shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-xl ${color}`}><Icon className="h-5 w-5 text-white" /></div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────
function UploadModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [cuentaBancaria, setCuentaBancaria] = useState("");
  const [bancoOverride, setBancoOverride] = useState("");
  const [result, setResult] = useState<UploadResp | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo");
      if (!cuentaBancaria.trim()) throw new Error("Ingresa el nombre de la cuenta bancaria");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("cuentaBancaria", cuentaBancaria);
      if (bancoOverride.trim()) fd.append("banco", bancoOverride);
      const res = await fetch("/api/financiero/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      return data as UploadResp;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "Carga exitosa",
        description: `${data.insertados} insertadas, ${data.duplicados} duplicadas omitidas (${data.detectedBank})`,
      });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reset = () => {
    setFile(null); setCuentaBancaria(""); setBancoOverride(""); setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar estado de cuenta</DialogTitle>
          <DialogDescription>Sube un archivo Excel de BCP, BBVA, Scotiabank o Interbank. El banco se detecta automáticamente.</DialogDescription>
        </DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">Archivo Excel (.xlsx)</Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="text-xs text-muted-foreground mt-1">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
            </div>
            <div>
              <Label htmlFor="cuenta">Cuenta bancaria *</Label>
              <Input
                id="cuenta"
                placeholder="Ej: BCP Soles - Henry Caballero"
                value={cuentaBancaria}
                onChange={(e) => setCuentaBancaria(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="banco-override">Banco (opcional, sobrescribe detección)</Label>
              <Input
                id="banco-override"
                placeholder="BCP, BBVA, SCOTIABANK, INTERBANK..."
                value={bancoOverride}
                onChange={(e) => setBancoOverride(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm text-emerald-800 font-medium">✓ Archivo procesado</p>
              <p className="text-xs text-emerald-700 mt-1">Banco detectado: <strong>{result.detectedBank}</strong></p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="text-xs text-blue-700">Insertadas</p>
                <p className="text-2xl font-bold text-blue-900">{result.insertados}</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-xs text-amber-700">Duplicadas</p>
                <p className="text-2xl font-bold text-amber-900">{result.duplicados}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-700">Total filas</p>
                <p className="text-2xl font-bold text-slate-900">{result.total}</p>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-center">
                <p className="text-xs text-rose-700">Omitidas</p>
                <p className="text-2xl font-bold text-rose-900">{result.omitidasInvalidas}</p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending || !file || !cuentaBancaria.trim()}>
                {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Cargar
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reset}>Cargar otro</Button>
              <Button onClick={handleClose}>Cerrar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline editor cell ───────────────────────────────────────────────────
function UsuarioCell({ tx, usuarios, onSave }: {
  tx: Transaction; usuarios: Usuario[];
  onSave: (txId: number, payload: { usuarioId?: number | null; usuarioTexto?: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [usuarioId, setUsuarioId] = useState<string>(tx.usuarioId ? String(tx.usuarioId) : "none");
  const [usuarioTexto, setUsuarioTexto] = useState<string>(tx.usuarioTexto ?? "");

  if (!editing) {
    return (
      <button
        type="button"
        className="text-left hover:bg-muted/40 rounded px-2 py-1 -mx-2 w-full"
        onClick={() => setEditing(true)}
      >
        {tx.usuarioName ? (
          <span className="text-sm font-medium">{tx.usuarioName}</span>
        ) : tx.usuarioTexto ? (
          <span className="text-sm italic text-muted-foreground">{tx.usuarioTexto}</span>
        ) : (
          <span className="text-xs text-muted-foreground">— asignar —</span>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <Select value={usuarioId} onValueChange={setUsuarioId}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Ninguno —</SelectItem>
          {usuarios.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className="h-8 text-xs"
        placeholder="O texto libre"
        value={usuarioTexto}
        onChange={(e) => setUsuarioTexto(e.target.value)}
      />
      <div className="flex gap-1">
        <Button size="sm" variant="default" className="h-7 px-2"
          onClick={() => {
            onSave(tx.id, {
              usuarioId: usuarioId === "none" ? null : Number(usuarioId),
              usuarioTexto: usuarioTexto.trim() || null,
            });
            setEditing(false);
          }}>
          <Save className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function BancoCell({ tx, onSave }: { tx: Transaction; onSave: (txId: number, banco: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(tx.banco);
  if (!editing) {
    return (
      <button type="button"
        className="text-left hover:bg-muted/40 rounded px-2 py-1 -mx-2"
        onClick={() => setEditing(true)}>
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
          <Building2 className="h-3 w-3" />{tx.banco}
        </span>
      </button>
    );
  }
  return (
    <div className="flex gap-1">
      <Input className="h-8 text-xs w-28" value={val} onChange={(e) => setVal(e.target.value.toUpperCase())} />
      <Button size="sm" className="h-7 px-2"
        onClick={() => { if (val.trim()) { onSave(tx.id, val.trim()); setEditing(false); } }}>
        <Save className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setVal(tx.banco); setEditing(false); }}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function PortalFinanciero() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("dashboard");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // filters
  const [bancoFilter, setBancoFilter] = useState<string>("all");
  const [usuarioFilter, setUsuarioFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filterQS = useMemo(() => {
    const p = new URLSearchParams();
    if (bancoFilter && bancoFilter !== "all") p.set("banco", bancoFilter);
    if (usuarioFilter && usuarioFilter !== "all") p.set("usuarioId", usuarioFilter);
    if (search.trim()) p.set("search", search.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (montoMin) p.set("montoMin", montoMin);
    if (montoMax) p.set("montoMax", montoMax);
    return p;
  }, [bancoFilter, usuarioFilter, search, from, to, montoMin, montoMax]);

  const txQs = useMemo(() => {
    const p = new URLSearchParams(filterQS);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p.toString();
  }, [filterQS, page]);

  // queries
  const usuariosQ = useQuery<Usuario[]>({
    queryKey: ["fin", "usuarios"],
    queryFn: async () => (await fetch("/api/financiero/usuarios")).json(),
  });
  const bancosQ = useQuery<string[]>({
    queryKey: ["fin", "bancos"],
    queryFn: async () => (await fetch("/api/financiero/bancos")).json(),
  });
  const kpisQ = useQuery<KpisResp>({
    queryKey: ["fin", "kpis", filterQS.toString()],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (bancoFilter !== "all") p.set("banco", bancoFilter);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      return (await fetch(`/api/financiero/kpis?${p}`)).json();
    },
  });
  const txQ = useQuery<{ items: Transaction[]; total: number; totalPages: number; page: number; }>({
    queryKey: ["fin", "tx", txQs],
    queryFn: async () => (await fetch(`/api/financiero/transactions?${txQs}`)).json(),
    placeholderData: keepPreviousData,
  });

  // mutations
  const patchMut = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const r = await fetch(`/api/financiero/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin"] });
      toast({ title: "Actualizado" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/financiero/transactions/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin"] });
      toast({ title: "Transacción eliminada" });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const exportFile = (fmt: "csv" | "xlsx") => {
    const url = `/api/financiero/export.${fmt}?${filterQS.toString()}`;
    window.open(url, "_blank");
  };

  const kpis = kpisQ.data?.kpis;
  const txs = txQ.data?.items ?? [];
  const totalPages = txQ.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={() => qc.invalidateQueries({ queryKey: ["fin"] })} />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteMut.mutate(confirmDelete)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="bg-white/50 border backdrop-blur-md rounded-xl">
            <TabsTrigger value="dashboard" className="rounded-lg"><LayoutDashboard className="h-4 w-4 mr-2" />Dashboard</TabsTrigger>
            <TabsTrigger value="transacciones" className="rounded-lg"><Receipt className="h-4 w-4 mr-2" />Transacciones</TabsTrigger>
          </TabsList>
          <Button onClick={() => setUploadOpen(true)} className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
            <Upload className="h-4 w-4 mr-2" />Cargar estado de cuenta
          </Button>
        </div>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={TrendingUp} label="Total ingresos" value={kpis ? fmtMoney(kpis.totalIngresos) : "—"} color="bg-emerald-500" />
            <KpiCard icon={TrendingDown} label="Total egresos" value={kpis ? fmtMoney(kpis.totalEgresos) : "—"} color="bg-rose-500" />
            <KpiCard icon={Wallet} label="Balance neto" value={kpis ? fmtMoney(kpis.balanceNeto) : "—"} color="bg-indigo-500" />
            <KpiCard icon={Hash} label="Total transacciones" value={kpis ? String(kpis.totalTransacciones) : "—"} color="bg-purple-500" />
          </div>

          <div className="glass-panel rounded-2xl p-6 border shadow-sm">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4" />Resumen por banco
            </h3>
            {kpisQ.data?.porBanco?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2">Banco</th>
                      <th className="py-2 text-right">Transacciones</th>
                      <th className="py-2 text-right">Ingresos</th>
                      <th className="py-2 text-right">Egresos</th>
                      <th className="py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpisQ.data.porBanco.map((b) => (
                      <tr key={b.banco} className="border-b">
                        <td className="py-2 font-medium">{b.banco}</td>
                        <td className="py-2 text-right">{b.total}</td>
                        <td className="py-2 text-right text-emerald-700">{fmtMoney(b.ingresos)}</td>
                        <td className="py-2 text-right text-rose-700">{fmtMoney(b.egresos)}</td>
                        <td className="py-2 text-right font-semibold">{fmtMoney(b.ingresos + b.egresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aún no hay transacciones. Carga un estado de cuenta para empezar.
              </p>
            )}
          </div>
        </TabsContent>

        {/* TRANSACCIONES */}
        <TabsContent value="transacciones" className="mt-6 space-y-4">
          {/* Filters */}
          <div className="glass-panel rounded-2xl p-4 border shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
              <div className="lg:col-span-2">
                <Label className="text-xs flex items-center gap-1"><Search className="h-3 w-3" />Buscar</Label>
                <Input placeholder="Descripción, nº op, cuenta..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" />Banco</Label>
                <Select value={bancoFilter} onValueChange={(v) => { setBancoFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(bancosQ.data ?? []).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Paciente</Label>
                <Select value={usuarioFilter} onValueChange={(v) => { setUsuarioFilter(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(usuariosQ.data ?? []).filter((u) => u.role === "user").map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Monto mín.</Label>
                <Input type="number" placeholder="-9999" value={montoMin} onChange={(e) => { setMontoMin(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label className="text-xs">Monto máx.</Label>
                <Input type="number" placeholder="9999" value={montoMax} onChange={(e) => { setMontoMax(e.target.value); setPage(1); }} />
              </div>
              <div className="flex gap-2 lg:col-span-3">
                <Button variant="outline" size="sm" onClick={() => exportFile("csv")} className="flex-1">
                  <Download className="h-4 w-4 mr-1" />CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportFile("xlsx")} className="flex-1">
                  <FileSpreadsheet className="h-4 w-4 mr-1" />Excel
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  setBancoFilter("all"); setUsuarioFilter("all"); setSearch(""); setFrom(""); setTo(""); setMontoMin(""); setMontoMax(""); setPage(1);
                }}>
                  Limpiar
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="glass-panel rounded-2xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/40 border-b">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Banco</th>
                    <th className="px-4 py-3">Cuenta</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Nº op.</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Paciente / Usuario</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {txQ.isLoading && (
                    <tr><td colSpan={8} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                  )}
                  {!txQ.isLoading && txs.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Sin resultados</td></tr>
                  )}
                  {txs.map((tx) => (
                    <tr key={tx.id} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-2 whitespace-nowrap">{fmtDate(tx.fecha)}</td>
                      <td className="px-4 py-2"><BancoCell tx={tx} onSave={(id, banco) => patchMut.mutate({ id, payload: { banco } })} /></td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[12rem] truncate" title={tx.cuentaBancaria}>{tx.cuentaBancaria}</td>
                      <td className="px-4 py-2 max-w-md truncate" title={tx.descripcion}>{tx.descripcion}</td>
                      <td className="px-4 py-2 text-xs font-mono">{tx.numeroOperacion ?? "—"}</td>
                      <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${tx.monto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {fmtMoney(tx.monto, tx.moneda)}
                      </td>
                      <td className="px-4 py-2 min-w-[12rem]">
                        <UsuarioCell
                          tx={tx}
                          usuarios={usuariosQ.data ?? []}
                          onSave={(id, payload) => patchMut.mutate({ id, payload })}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(tx.id)}>
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-white/30">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} ({txQ.data?.total ?? 0} resultados)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
