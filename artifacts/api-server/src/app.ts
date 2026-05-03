import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import jwt from "jsonwebtoken";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: TOKEN_SECRET ?? "abc-tcc-dev-secret-do-not-use-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

const TOKEN_SECRET = process.env.SESSION_SECRET;
if (!TOKEN_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET environment variable is required in production");
}

app.use((req: any, _res, next) => {
  if (req.session?.userId) return next();
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ") && TOKEN_SECRET) {
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, TOKEN_SECRET) as { userId?: number };
      if (payload?.userId && req.session) {
        req.session.userId = payload.userId;
      }
    } catch {
      // ignore invalid token; downstream auth guards will reject
    }
  }
  next();
});

app.use("/api", router);

export default app;
