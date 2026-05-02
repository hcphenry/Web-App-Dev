import { pgTable, serial, text, timestamp, integer, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  fecha: timestamp("fecha").notNull(),
  descripcion: text("descripcion").notNull(),
  monto: numeric("monto", { precision: 14, scale: 2 }).notNull(),
  moneda: text("moneda").notNull().default("PEN"),
  numeroOperacion: text("numero_operacion"),
  banco: text("banco").notNull(),
  cuentaBancaria: text("cuenta_bancaria").notNull(),
  usuarioId: integer("usuario_id").references(() => usersTable.id, { onDelete: "set null" }),
  usuarioTexto: text("usuario_texto"),
  hashUnico: text("hash_unico").notNull(),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  hashUq: uniqueIndex("transactions_hash_uq").on(t.hashUnico),
  bancoIdx: index("transactions_banco_idx").on(t.banco),
  fechaIdx: index("transactions_fecha_idx").on(t.fecha),
  usuarioIdx: index("transactions_usuario_idx").on(t.usuarioId),
}));

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;
