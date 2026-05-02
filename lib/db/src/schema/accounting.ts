import { pgTable, serial, text, timestamp, integer, numeric, pgEnum, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const estadoPagoEnum = pgEnum("estado_pago", ["pagado", "pendiente", "deuda"]);

export const tarifasPacienteTable = pgTable("tarifas_paciente", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  montoPorSesion: numeric("monto_por_sesion", { precision: 10, scale: 2 }).notNull(),
  moneda: text("moneda").notNull().default("PEN"),
  vigenteDesde: timestamp("vigente_desde").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  montoNonneg: check("tarifas_paciente_monto_nonneg", sql`${t.montoPorSesion} >= 0`),
}));

export const sesionesContabilidadTable = pgTable("sesiones_contabilidad", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  psicologoId: integer("psicologo_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  fechaSesion: timestamp("fecha_sesion").notNull(),
  montoCobrado: numeric("monto_cobrado", { precision: 10, scale: 2 }).notNull(),
  moneda: text("moneda").notNull().default("PEN"),
  estadoPago: estadoPagoEnum("estado_pago").notNull().default("pendiente"),
  fechaPago: timestamp("fecha_pago"),
  metodoPago: text("metodo_pago"),
  notas: text("notas"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  pacienteIdx: index("sesiones_paciente_idx").on(t.pacienteId),
  psicologoIdx: index("sesiones_psicologo_idx").on(t.psicologoId),
  estadoIdx: index("sesiones_estado_idx").on(t.estadoPago),
  fechaIdx: index("sesiones_fecha_idx").on(t.fechaSesion),
  montoNonneg: check("sesiones_contabilidad_monto_nonneg", sql`${t.montoCobrado} >= 0`),
}));

export type TarifaPaciente = typeof tarifasPacienteTable.$inferSelect;
export type InsertTarifaPaciente = typeof tarifasPacienteTable.$inferInsert;
export type SesionContabilidad = typeof sesionesContabilidadTable.$inferSelect;
export type InsertSesionContabilidad = typeof sesionesContabilidadTable.$inferInsert;
