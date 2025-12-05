import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

import { subscribeRouter } from "./routers/subs";
import { statusRouter } from "./routers/status";
import { publishRouter } from "./routers/push";

import "./services/mqtt"; // initialize MQTT

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use("/subscribe", subscribeRouter);
app.use("/status", statusRouter);
app.use("/publish", publishRouter);

app.listen(3000, () => {
    console.log("Backend running on http://localhost:3000");
});
