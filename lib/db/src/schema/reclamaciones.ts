import { pgTable, serial, text, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reclamacionesTable = pgTable("reclamaciones", {
  id: serial("id").primaryKey(),
  correlativo: text("correlativo").notNull(),
  fecha: text("fecha").notNull(),
  tipoReclamo: text("tipo_reclamo").notNull(),
  tipoItem: text("tipo_item").notNull(),
  nombres: text("nombres").notNull(),
  dni: text("dni").notNull(),
  domicilio: text("domicilio").notNull(),
  telefono: text("telefono").notNull(),
  email: text("email").notNull(),
  esMenor: boolean("es_menor").default(false),
  repNombres: text("rep_nombres"),
  repDni: text("rep_dni"),
  repVinculo: text("rep_vinculo"),
  monto: numeric("monto"),
  descripcionBien: text("descripcion_bien").notNull(),
  detalle: text("detalle").notNull(),
  pedido: text("pedido").notNull(),
  emailEnviado: boolean("email_enviado").default(false),
  creadoEn: timestamp("creado_en").defaultNow(),
});

export const insertReclamacionSchema = createInsertSchema(reclamacionesTable).omit({
  id: true,
  correlativo: true,
  emailEnviado: true,
  creadoEn: true,
});

export type InsertReclamacion = z.infer<typeof insertReclamacionSchema>;
export type Reclamacion = typeof reclamacionesTable.$inferSelect;
