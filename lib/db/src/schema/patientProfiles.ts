import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const patientProfilesTable = pgTable("patient_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  primerNombre: text("primer_nombre"),
  segundoNombre: text("segundo_nombre"),
  apellidoPaterno: text("apellido_paterno"),
  apellidoMaterno: text("apellido_materno"),
  perioricidad: text("perioricidad"),
  fechaAlta: text("fecha_alta"),
  estado: text("estado").default("activo"),
  nroCelular: text("nro_celular"),
  tipoDocumento: text("tipo_documento"),
  numeroDocumento: text("numero_documento"),
  fechaNacimiento: text("fecha_nacimiento"),
  sexo: text("sexo"),
  direccion: text("direccion"),
  distrito: text("distrito"),
  ciudad: text("ciudad"),
  departamento: text("departamento"),
  pais: text("pais").default("Perú"),
  costoTerapia: text("costo_terapia"),
  psicologaAsignada: text("psicologa_asignada"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PatientProfile = typeof patientProfilesTable.$inferSelect;
export type InsertPatientProfile = typeof patientProfilesTable.$inferInsert;
