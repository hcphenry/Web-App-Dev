import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import {
  db,
  usersTable,
  transactionsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, lte, lt, ilike, or } from "drizzle-orm";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ─── Auth middleware ──────────────────────────────────────────────────────
function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  if (req.session.userRole !== "admin") {
    res.status(403).json({ error: "Acceso denegado" });
    return;
  }
  next();
}

async function loadUserRole(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) return next();
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (users[0]) {
    req.session.userRole = users[0].role;
  } else {
    // User was deleted — clear stale role to prevent privilege persistence
    req.session.userRole = null;
    req.session.userId = null;
  }
  next();
}

router.use(loadUserRole);

// ─── Helpers ──────────────────────────────────────────────────────────────
function normalizeHeader(h: string): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

type BankKey = "BCP" | "BBVA" | "SCOTIABANK" | "INTERBANK";
interface BankSpec {
  key: BankKey;
  fecha: string[];
  descripcion: string[];
  monto: string[];
  numeroOperacion?: string[];
  cargoColumn?: string[];
}

// Order matters: most specific signatures first (Interbank/Scotia distinguish by unique cols,
// BCP is more specific than BBVA because it requires "Numero de Operacion").
const BANK_SPECS: BankSpec[] = [
  {
    key: "INTERBANK",
    // "Fecha de operacion" is unique to Interbank (vs plain "Fecha")
    fecha: ["FECHA DE OPERACION"],
    descripcion: ["DESCRIPCION"],
    monto: ["ABONO"],
    numeroOperacion: ["NRO DE OPERACION", "NUMERO DE OPERACION", "N DE OPERACION"],
    cargoColumn: ["CARGO"],
  },
  {
    key: "SCOTIABANK",
    // "Importe S/" is unique (vs "Monto")
    fecha: ["FECHA"],
    descripcion: ["DESCRIPCION", "DESCRIPCI"],
    monto: ["IMPORTE S", "IMPORTE"],
  },
  {
    key: "BCP",
    // Distinguished from BBVA by REQUIRING "Numero de Operacion"
    fecha: ["FECHA"],
    descripcion: ["DESCRIPCION"],
    monto: ["MONTO"],
    numeroOperacion: ["NUMERO DE OPERACION", "NRO DE OPERACION", "N DE OPERACION"],
  },
  {
    // Fallback when only the 3 minimum columns are present
    key: "BBVA",
    fecha: ["FECHA"],
    descripcion: ["DESCRIPCION"],
    monto: ["MONTO"],
  },
];

function detectBank(headers: string[]): { spec: BankSpec; map: Record<string, number> } | null {
  const norm = headers.map(normalizeHeader);
  for (const spec of BANK_SPECS) {
    const fechaIdx = norm.findIndex((h) => spec.fecha.some((f) => h === f || h.startsWith(f)));
    const descIdx = norm.findIndex((h) => spec.descripcion.some((d) => h === d || h.startsWith(d)));
    const montoIdx = norm.findIndex((h) => spec.monto.some((m) => h === m || h.startsWith(m)));
    if (fechaIdx === -1 || descIdx === -1 || montoIdx === -1) continue;

    // If the spec lists numeroOperacion, it is REQUIRED for that bank
    let nopIdx = -1;
    if (spec.numeroOperacion) {
      nopIdx = norm.findIndex((h) => spec.numeroOperacion!.some((n) => h === n || h.startsWith(n)));
      if (nopIdx === -1) continue;
    }

    const map: Record<string, number> = { fecha: fechaIdx, descripcion: descIdx, monto: montoIdx };
    if (nopIdx !== -1) map.numeroOperacion = nopIdx;

    if (spec.cargoColumn) {
      const cargoIdx = norm.findIndex((h) => spec.cargoColumn!.some((c) => h === c || h.startsWith(c)));
      if (cargoIdx !== -1) map.cargo = cargoIdx;
    }
    return { spec, map };
  }
  return null;
}

// Parse a date from Excel cell value -> Date stored at midnight Lima time (UTC = +5h)
function parseExcelDate(val: any): Date | null {
  if (val === null || val === undefined || val === "") return null;
  // Excel serial number
  if (typeof val === "number" && Number.isFinite(val)) {
    // XLSX.SSF.parse_date_code returns y/m/d/H/M/S
    const d: any = (XLSX as any).SSF?.parse_date_code?.(val);
    if (d) {
      // Treat as Lima local date -> UTC by adding 5h
      return new Date(Date.UTC(d.y, d.m - 1, d.d, 5, 0, 0));
    }
  }
  if (val instanceof Date) {
    // Already a JS Date — interpret as Lima midnight
    return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate(), 5, 0, 0));
  }
  const s = String(val).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, dd, mm, yy] = m;
    let yyyy = parseInt(yy, 10);
    if (yyyy < 100) yyyy += 2000;
    const day = parseInt(dd, 10);
    const month = parseInt(mm, 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(Date.UTC(yyyy, month - 1, day, 5, 0, 0));
    }
  }
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 5, 0, 0));
  }
  // Strict: reject anything we can't interpret as a Lima date.
  // (Avoid ambiguous `new Date(s)` which depends on host TZ.)
  return null;
}

// Parse a YYYY-MM-DD query string as a Lima-day boundary in UTC.
// `end=false` -> 00:00 Lima (= 05:00 UTC) of that day.
// `end=true`  -> 00:00 Lima of the NEXT day (used as exclusive upper bound).
function parseLimaDayBoundary(s: string, end: boolean): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const day = end ? d + 1 : d;
  const dt = new Date(Date.UTC(y, mo, day, 5, 0, 0));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function parseAmount(val: any): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  let s = String(val).trim();
  // Remove currency symbols like "S/", "S/."
  s = s.replace(/[Ss]\/\.?/g, "").replace(/[€$]/g, "").trim();
  // Remove thousand separators (commas) — assume dot is decimal
  // If both '.' and ',' present, assume ',' is thousands
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    // Comma as decimal separator
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function computeHash(banco: string, cuentaBancaria: string, fechaIso: string, monto: number, numeroOperacion: string | null, descripcion: string): string {
  // cuentaBancaria included so the same operation in two different accounts is NOT
  // treated as a duplicate (avoid false-positive deduplication / data loss).
  const key = [banco, cuentaBancaria, fechaIso, monto.toFixed(2), numeroOperacion ?? "", descripcion ?? ""].join("|");
  return createHash("sha256").update(key).digest("hex");
}

// ─── POST /upload ─────────────────────────────────────────────────────────
router.post("/upload", requireAdmin, upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No se adjuntó ningún archivo" });
      return;
    }
    const cuentaBancaria = String(req.body?.cuentaBancaria ?? "").trim();
    if (!cuentaBancaria) {
      res.status(400).json({ error: "Debe indicar la cuenta bancaria" });
      return;
    }
    const bancoOverride = String(req.body?.banco ?? "").trim().toUpperCase();

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    } catch {
      res.status(400).json({ error: "El archivo no es un Excel válido" });
      return;
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: "El archivo no contiene hojas" });
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

    // Find header row: scan first 15 rows for one that matches a known bank signature
    let headerRowIdx = -1;
    let detection: ReturnType<typeof detectBank> = null;
    const maxScan = Math.min(15, rows.length);
    for (let i = 0; i < maxScan; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const headers = row.map((c) => (c == null ? "" : String(c)));
      const det = detectBank(headers);
      if (det) {
        detection = det;
        headerRowIdx = i;
        break;
      }
    }

    if (!detection || headerRowIdx === -1) {
      res.status(400).json({
        error: "No se pudo identificar el banco. Verifica que el Excel tenga las columnas esperadas (BCP, BBVA, Scotiabank o Interbank).",
      });
      return;
    }

    const banco = bancoOverride || detection.spec.key;
    const map = detection.map;

    // Process data rows
    const candidates: Array<{
      fecha: Date;
      descripcion: string;
      monto: number;
      numeroOperacion: string | null;
      hashUnico: string;
    }> = [];
    let skippedInvalid = 0;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.every((c) => c == null || c === "")) continue;

      const fecha = parseExcelDate(row[map.fecha]);
      const descripcion = String(row[map.descripcion] ?? "").trim();
      let monto = parseAmount(row[map.monto]);

      // Interbank: cargo column (negative outflow) if abono is empty
      if ((monto === null || monto === 0) && map.cargo !== undefined) {
        const cargo = parseAmount(row[map.cargo]);
        if (cargo !== null && cargo !== 0) {
          monto = -Math.abs(cargo);
        }
      }

      if (!fecha || !descripcion || monto === null) {
        skippedInvalid++;
        continue;
      }

      const numeroOperacion = map.numeroOperacion !== undefined
        ? (row[map.numeroOperacion] != null ? String(row[map.numeroOperacion]).trim() : null)
        : null;

      const fechaIso = fecha.toISOString();
      const hashUnico = computeHash(banco, cuentaBancaria, fechaIso, monto, numeroOperacion, descripcion);

      candidates.push({ fecha, descripcion, monto, numeroOperacion, hashUnico });
    }

    if (candidates.length === 0) {
      res.status(400).json({ error: "No se encontraron filas válidas para procesar", detectedBank: detection.spec.key });
      return;
    }

    // Bulk insert with onConflictDoNothing on hashUnico
    const valuesToInsert = candidates.map((c) => ({
      fecha: c.fecha,
      descripcion: c.descripcion,
      monto: c.monto.toFixed(2),
      moneda: "PEN",
      numeroOperacion: c.numeroOperacion,
      banco,
      cuentaBancaria,
      hashUnico: c.hashUnico,
      uploadedBy: req.session.userId as number,
    }));

    const inserted = await db
      .insert(transactionsTable)
      .values(valuesToInsert)
      .onConflictDoNothing({ target: transactionsTable.hashUnico })
      .returning({ id: transactionsTable.id });

    const insertedCount = inserted.length;
    const duplicados = candidates.length - insertedCount;

    await logAudit({
      actorId: req.session.userId,
      action: "FINANCIERO_UPLOAD",
      targetTable: "transaction",
      targetId: null,
      details: {
        banco,
        cuentaBancaria,
        archivo: req.file.originalname,
        totalFilas: candidates.length,
        insertados: insertedCount,
        duplicados,
        omitidasInvalidas: skippedInvalid,
      },
    });

    res.json({
      banco,
      detectedBank: detection.spec.key,
      total: candidates.length,
      insertados: insertedCount,
      duplicados,
      omitidasInvalidas: skippedInvalid,
    });
  } catch (err: any) {
    console.error("[financiero/upload] error:", err);
    res.status(500).json({ error: err?.message ?? "Error procesando archivo" });
  }
});

// ─── GET /transactions ────────────────────────────────────────────────────
router.get("/transactions", requireAdmin, async (req, res) => {
  const banco = req.query.banco ? String(req.query.banco) : undefined;
  const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : "";
  const from = req.query.from ? parseLimaDayBoundary(String(req.query.from), false) : undefined;
  const to = req.query.to ? parseLimaDayBoundary(String(req.query.to), true) : undefined;
  const montoMin = req.query.montoMin !== undefined ? Number(req.query.montoMin) : undefined;
  const montoMax = req.query.montoMax !== undefined ? Number(req.query.montoMax) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));

  const conds: any[] = [];
  if (banco) conds.push(eq(transactionsTable.banco, banco));
  if (usuarioId && Number.isFinite(usuarioId)) conds.push(eq(transactionsTable.usuarioId, usuarioId));
  if (search) {
    conds.push(or(
      ilike(transactionsTable.descripcion, `%${search}%`),
      ilike(transactionsTable.numeroOperacion, `%${search}%`),
      ilike(transactionsTable.cuentaBancaria, `%${search}%`),
      ilike(transactionsTable.usuarioTexto, `%${search}%`),
    ));
  }
  if (from) conds.push(gte(transactionsTable.fecha, from));
  if (to) conds.push(lt(transactionsTable.fecha, to));
  if (montoMin !== undefined && Number.isFinite(montoMin)) conds.push(gte(transactionsTable.monto, String(montoMin)));
  if (montoMax !== undefined && Number.isFinite(montoMax)) conds.push(lte(transactionsTable.monto, String(montoMax)));

  const where = conds.length ? and(...conds) : undefined;

  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactionsTable)
    .where(where as any);

  const offset = (page - 1) * pageSize;
  const rows = await db
    .select({
      id: transactionsTable.id,
      fecha: transactionsTable.fecha,
      descripcion: transactionsTable.descripcion,
      monto: transactionsTable.monto,
      moneda: transactionsTable.moneda,
      numeroOperacion: transactionsTable.numeroOperacion,
      banco: transactionsTable.banco,
      cuentaBancaria: transactionsTable.cuentaBancaria,
      usuarioId: transactionsTable.usuarioId,
      usuarioTexto: transactionsTable.usuarioTexto,
      usuarioName: usersTable.name,
      usuarioEmail: usersTable.email,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.usuarioId, usersTable.id))
    .where(where as any)
    .orderBy(desc(transactionsTable.fecha), desc(transactionsTable.id))
    .limit(pageSize)
    .offset(offset);

  res.json({
    items: rows.map((r) => ({ ...r, monto: Number(r.monto) })),
    page,
    pageSize,
    total: totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  });
});

// ─── PATCH /transactions/:id ──────────────────────────────────────────────
router.patch("/transactions/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const { usuarioId, usuarioTexto, banco, cuentaBancaria } = req.body ?? {};

  const updates: any = { updatedAt: new Date() };
  if (usuarioId !== undefined) {
    if (usuarioId === null || usuarioId === "") {
      updates.usuarioId = null;
    } else {
      const uid = Number(usuarioId);
      if (!Number.isFinite(uid)) { res.status(400).json({ error: "usuarioId inválido" }); return; }
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, uid)).limit(1);
      if (!u) { res.status(404).json({ error: "Usuario no encontrado" }); return; }
      updates.usuarioId = uid;
    }
  }
  if (usuarioTexto !== undefined) updates.usuarioTexto = usuarioTexto ? String(usuarioTexto) : null;
  if (banco !== undefined && typeof banco === "string" && banco.trim()) updates.banco = banco.trim();
  if (cuentaBancaria !== undefined && typeof cuentaBancaria === "string" && cuentaBancaria.trim()) {
    updates.cuentaBancaria = cuentaBancaria.trim();
  }

  const [updated] = await db.update(transactionsTable).set(updates).where(eq(transactionsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Transacción no encontrada" }); return; }

  await logAudit({
    actorId: req.session.userId,
    action: "FINANCIERO_UPDATE",
    targetTable: "transaction",
    targetId: id,
    details: { changes: updates },
  });

  res.json(updated);
});

// ─── DELETE /transactions/:id ─────────────────────────────────────────────
router.delete("/transactions/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "ID inválido" }); return; }
  const [deleted] = await db.delete(transactionsTable).where(eq(transactionsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Transacción no encontrada" }); return; }
  await logAudit({
    actorId: req.session.userId,
    action: "FINANCIERO_DELETE",
    targetTable: "transaction",
    targetId: id,
    details: { banco: deleted.banco, monto: deleted.monto },
  });
  res.json({ ok: true });
});

// ─── GET /kpis ────────────────────────────────────────────────────────────
router.get("/kpis", requireAdmin, async (req, res) => {
  const banco = req.query.banco ? String(req.query.banco) : undefined;
  const from = req.query.from ? parseLimaDayBoundary(String(req.query.from), false) : undefined;
  const to = req.query.to ? parseLimaDayBoundary(String(req.query.to), true) : undefined;

  const conds: any[] = [];
  if (banco) conds.push(eq(transactionsTable.banco, banco));
  if (from) conds.push(gte(transactionsTable.fecha, from));
  if (to) conds.push(lt(transactionsTable.fecha, to));
  const where = conds.length ? and(...conds) : undefined;

  const [agg] = await db
    .select({
      totalIngresos: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.monto} > 0 THEN ${transactionsTable.monto} ELSE 0 END), 0)`,
      totalEgresos: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.monto} < 0 THEN ${transactionsTable.monto} ELSE 0 END), 0)`,
      balanceNeto: sql<string>`COALESCE(SUM(${transactionsTable.monto}), 0)`,
      total: sql<number>`count(*)::int`,
    })
    .from(transactionsTable)
    .where(where as any);

  const porBanco = await db
    .select({
      banco: transactionsTable.banco,
      total: sql<number>`count(*)::int`,
      ingresos: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.monto} > 0 THEN ${transactionsTable.monto} ELSE 0 END), 0)`,
      egresos: sql<string>`COALESCE(SUM(CASE WHEN ${transactionsTable.monto} < 0 THEN ${transactionsTable.monto} ELSE 0 END), 0)`,
    })
    .from(transactionsTable)
    .where(where as any)
    .groupBy(transactionsTable.banco);

  res.json({
    kpis: {
      totalIngresos: Number(agg.totalIngresos),
      totalEgresos: Number(agg.totalEgresos),
      balanceNeto: Number(agg.balanceNeto),
      totalTransacciones: agg.total,
    },
    porBanco: porBanco.map((b) => ({
      banco: b.banco,
      total: b.total,
      ingresos: Number(b.ingresos),
      egresos: Number(b.egresos),
    })),
  });
});

// ─── GET /export.csv ──────────────────────────────────────────────────────
router.get("/export.csv", requireAdmin, async (req, res) => {
  const banco = req.query.banco ? String(req.query.banco) : undefined;
  const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : undefined;
  const from = req.query.from ? parseLimaDayBoundary(String(req.query.from), false) : undefined;
  const to = req.query.to ? parseLimaDayBoundary(String(req.query.to), true) : undefined;

  const conds: any[] = [];
  if (banco) conds.push(eq(transactionsTable.banco, banco));
  if (usuarioId && Number.isFinite(usuarioId)) conds.push(eq(transactionsTable.usuarioId, usuarioId));
  if (from) conds.push(gte(transactionsTable.fecha, from));
  if (to) conds.push(lt(transactionsTable.fecha, to));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: transactionsTable.id,
      fecha: transactionsTable.fecha,
      banco: transactionsTable.banco,
      cuentaBancaria: transactionsTable.cuentaBancaria,
      descripcion: transactionsTable.descripcion,
      monto: transactionsTable.monto,
      moneda: transactionsTable.moneda,
      numeroOperacion: transactionsTable.numeroOperacion,
      usuarioName: usersTable.name,
      usuarioEmail: usersTable.email,
      usuarioTexto: transactionsTable.usuarioTexto,
    })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.usuarioId, usersTable.id))
    .where(where as any)
    .orderBy(desc(transactionsTable.fecha));

  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };

  const header = ["id", "fecha", "banco", "cuenta_bancaria", "descripcion", "monto", "moneda", "numero_operacion", "usuario_nombre", "usuario_email", "usuario_texto"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.id,
      r.fecha?.toISOString() ?? "",
      r.banco,
      r.cuentaBancaria,
      r.descripcion,
      r.monto,
      r.moneda,
      r.numeroOperacion ?? "",
      r.usuarioName ?? "",
      r.usuarioEmail ?? "",
      r.usuarioTexto ?? "",
    ].map(escape).join(","));
  }
  // BOM for Excel UTF-8 compat
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transacciones_${Date.now()}.csv"`);
  res.send("\uFEFF" + lines.join("\n"));
});

// ─── GET /export.xlsx ─────────────────────────────────────────────────────
router.get("/export.xlsx", requireAdmin, async (req, res) => {
  const banco = req.query.banco ? String(req.query.banco) : undefined;
  const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : undefined;
  const from = req.query.from ? parseLimaDayBoundary(String(req.query.from), false) : undefined;
  const to = req.query.to ? parseLimaDayBoundary(String(req.query.to), true) : undefined;

  const conds: any[] = [];
  if (banco) conds.push(eq(transactionsTable.banco, banco));
  if (usuarioId && Number.isFinite(usuarioId)) conds.push(eq(transactionsTable.usuarioId, usuarioId));
  if (from) conds.push(gte(transactionsTable.fecha, from));
  if (to) conds.push(lt(transactionsTable.fecha, to));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: transactionsTable.id,
      fecha: transactionsTable.fecha,
      banco: transactionsTable.banco,
      cuentaBancaria: transactionsTable.cuentaBancaria,
      descripcion: transactionsTable.descripcion,
      monto: transactionsTable.monto,
      moneda: transactionsTable.moneda,
      numeroOperacion: transactionsTable.numeroOperacion,
      usuarioName: usersTable.name,
      usuarioEmail: usersTable.email,
      usuarioTexto: transactionsTable.usuarioTexto,
    })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.usuarioId, usersTable.id))
    .where(where as any)
    .orderBy(desc(transactionsTable.fecha));

  const aoa = [
    ["ID", "Fecha", "Banco", "Cuenta Bancaria", "Descripción", "Monto", "Moneda", "Número Operación", "Usuario", "Email", "Usuario (texto)"],
    ...rows.map((r) => [
      r.id,
      r.fecha?.toISOString().split("T")[0] ?? "",
      r.banco,
      r.cuentaBancaria,
      r.descripcion,
      Number(r.monto),
      r.moneda,
      r.numeroOperacion ?? "",
      r.usuarioName ?? "",
      r.usuarioEmail ?? "",
      r.usuarioTexto ?? "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="transacciones_${Date.now()}.xlsx"`);
  res.send(buf);
});

// ─── GET /usuarios (helper for assigning to transactions) ─────────────────
router.get("/usuarios", requireAdmin, async (_req, res) => {
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .orderBy(usersTable.name);
  res.json(users);
});

// ─── GET /bancos (distinct list) ──────────────────────────────────────────
router.get("/bancos", requireAdmin, async (_req, res) => {
  const rows = await db
    .selectDistinct({ banco: transactionsTable.banco })
    .from(transactionsTable);
  res.json(rows.map((r) => r.banco));
});

export default router;
