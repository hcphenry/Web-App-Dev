import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import recordsRouter from "./records";
import psychologistsRouter from "./psychologists";
import patientProfilesRouter from "./patientProfiles";
import accountingRouter from "./accounting";
import financieroRouter from "./financiero";
import therapeuticTasksRouter from "./therapeuticTasks";
import anamnesisRecordsRouter from "./anamnesisRecords";
import primeraConsultaRecordsRouter from "./primeraConsultaRecords";
import desarrolloSesionRecordsRouter from "./desarrolloSesionRecords";
import consultaPsicologicaRecordsRouter from "./consultaPsicologicaRecords";
import planIntervencionRecordsRouter from "./planIntervencionRecords";
import lineaVidaRecordsRouter from "./lineaVidaRecords";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", usersRouter);
router.use(recordsRouter);
router.use(psychologistsRouter);
router.use(patientProfilesRouter);
router.use("/contabilidad", accountingRouter);
// Portal Agenda reuses the accounting endpoints (tarifas, sesiones,
// reportes). The handlers already enforce requireAdmin and the data model
// is identical, so we expose the same router under /agenda as an alias to
// satisfy the prompt's /api/agenda/* contract without duplicating logic.
router.use("/agenda", accountingRouter);
router.use("/financiero", financieroRouter);
router.use("/tareas", therapeuticTasksRouter);
router.use("/anamnesis", anamnesisRecordsRouter);
router.use("/primera-consulta", primeraConsultaRecordsRouter);
router.use("/desarrollo-sesion", desarrolloSesionRecordsRouter);
router.use("/consulta-psicologica", consultaPsicologicaRecordsRouter);
router.use("/plan-intervencion", planIntervencionRecordsRouter);
router.use("/linea-vida", lineaVidaRecordsRouter);

export default router;
