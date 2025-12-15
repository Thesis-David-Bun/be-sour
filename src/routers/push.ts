import { Router } from "express";
import { sendResetSignal } from "../services/mqtt_ser.js";
import { FuzzyLogic } from "../FuzzyLogic/FuzzyLogic.js";
import { Q } from "../FuzzyLogic/FuzzyEnv.js";

export const publishRouter = Router();

publishRouter.post("/reset", (_, res) => {
    sendResetSignal();
    res.json({ reset: true });
});

// const FL = new FuzzyLogic();

// publishRouter.get("/", (_, res) => {
//     let payload: any = {
//         fil_mean_E: 2400,
//         fil_mean_H: 202,
//         fil_mean_T: 30,
//         raw_mean_E: 0,
//         raw_mean_H: 0,
//         raw_mean_T: 0,
//     };
//     FL.raw_input_pre_processing(payload);
//     const input_fl = FL.input_pre_processing(Q);
//     const s = FL.infer(input_fl);
//     payload.status = s.status;
//     payload.crisp = s.crisp;
//     payload.isNotify = s.isNotify;
//     res.json({ 1: payload, 2: input_fl });
// });