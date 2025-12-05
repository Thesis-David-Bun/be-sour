import { Router } from "express";
import { SubscriptionService } from "../services/subs_ser.js";

export const subscribeRouter = Router();

subscribeRouter.post("/", (req, res) => {
    SubscriptionService.add(req.body);
    res.status(201).json({ message: "Subscription saved" });
});

subscribeRouter.get("/", (_, res) => {
    res.json(SubscriptionService.getAll());
});
