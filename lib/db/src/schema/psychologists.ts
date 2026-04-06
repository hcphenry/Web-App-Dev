import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const psychologistProfilesTable = pgTable("psychologist_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  dateOfBirth: text("date_of_birth"),
  profession: text("profession"),
  registrationDate: text("registration_date"),
  deregistrationDate: text("deregistration_date"),
  commissionPercentage: text("commission_percentage"),
  licenseNumber: text("license_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const availabilitySlotsTable = pgTable("availability_slots", {
  id: serial("id").primaryKey(),
  psychologistId: integer("psychologist_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
