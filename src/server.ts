import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

import { subscribeRouter } from "./routers/subs_rou.js";
import { statusRouter } from "./routers/status.js";
import { publishRouter } from "./routers/push.js";

import "./services/mqtt_ser.js"; // initialize MQTT

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use("/subscribe", subscribeRouter);
app.use("/status", statusRouter);
app.use("/publish", publishRouter);

app.listen(3000, () => {
    console.log("Backend running on http://localhost:3000");
});

/*
{"raw_mean_H":140,"raw_mean_E":3200,"raw_mean_T":30,"fil_mean_H":143,"fil_mean_E":3000,"fil_mean_T":30}
*/