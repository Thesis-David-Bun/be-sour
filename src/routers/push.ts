import { Router } from "express";
import { sendResetSignal } from "../services/mqtt_ser.js";
import { FuzzyLogic } from "../FuzzyLogic/FuzzyLogic.js";
import { P, Q } from "../FuzzyLogic/FuzzyEnv.js";
import { PushService } from "../services/web_push.js";

export const publishRouter = Router();

publishRouter.post("/reset", (_, res) => {
    sendResetSignal();
    PushService.notifyAll({
        title: "Starter's ready",
        body: JSON.stringify({
            "raw_mean_E": 3583,
            "fil_mean_E": 3577.27,
            "raw_mean_T": 32.31,
            "fil_mean_T": 32.31,
            "raw_mean_H": 118,
            "fil_mean_H": 118,
            "status": "Starter's Ready",
            "crisp": 0.925,
            "isNotify": true,
            "timestamp": 1767878602962,
            "rasio_rs_ro": 1.9277768177756662
        }),
        timestamp: Date.now()
    });
    res.json({ reset: true });
});

publishRouter.get("/", (req, res) => {
    res.json({ P, Q });
});

let currentPayload = {
    fil_mean_E: 0,
    fil_mean_H: 0,
    fil_mean_T: 0,
    raw_mean_E: 0,
    raw_mean_H: 0,
    raw_mean_T: 0,
    status: 'TEST',
    crisp: 0,
    isNotify: true,
    timestamp: 0,
};

publishRouter.post("/test", (_, res) => {
    PushService.notifyAll({
        title: 'Starter\'s ready',
        body: JSON.stringify({ isNotify: true }),
        timestamp: Date.now()
    });
    res.json({ test: true });
});