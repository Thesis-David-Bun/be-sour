import { Router } from "express";
import { getSuccessCount } from "../services/mqtt";

export const statusRouter = Router();

statusRouter.get("/", (_, res) => {
    res.json({ success_count: getSuccessCount() });
});
