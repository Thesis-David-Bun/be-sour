import { Router } from "express";
import { sendResetSignal } from "../services/mqtt";

export const publishRouter = Router();

publishRouter.post("/reset", (_, res) => {
    sendResetSignal();
    res.json({ reset: true });
});
