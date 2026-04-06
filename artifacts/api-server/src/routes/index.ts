import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import recordsRouter from "./records";
import psychologistsRouter from "./psychologists";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", usersRouter);
router.use(recordsRouter);
router.use(psychologistsRouter);

export default router;
