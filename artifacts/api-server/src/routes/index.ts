import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import recordsRouter from "./records";
import psychologistsRouter from "./psychologists";
import patientProfilesRouter from "./patientProfiles";
import accountingRouter from "./accounting";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", usersRouter);
router.use(recordsRouter);
router.use(psychologistsRouter);
router.use(patientProfilesRouter);
router.use("/contabilidad", accountingRouter);

export default router;
