import mqtt from "mqtt";
import { ENV } from "../config/env.js";
import { MQTT_TOPICS } from "../config/env.js";
import { PushService } from "./web_push.js";
import { FuzzyLogic } from "../FuzzyLogic/FuzzyLogic.js";

let resetFlag = "0";
let successCount = 0;

const clientId = "Sourdough-" + Math.random().toString(16).slice(2);
const url = `mqtts://${ENV.MQTT_HOST}:${ENV.MQTT_PORT}`;

const FL = new FuzzyLogic();

export const mqttClient = mqtt.connect(url, {
    clientId,
    clean: true,
    username: ENV.MQTT_USER,
    password: ENV.MQTT_PASS,
});

mqttClient.on("connect", () => {
    console.log("MQTT Connected");

    mqttClient.subscribe(MQTT_TOPICS.SENSOR, err => {
        if (err) console.error("MQTT subscription error:", err);
    });
});

mqttClient.on("message", (topic, msg) => {
    const message = msg.toString();

    const payload = JSON.parse(message);

    if (resetFlag === "1") {
        FL.reset_Q();
        resetFlag = "0";
        successCount++;
    }
    const s = FL.infer(payload.fil_mean_H, payload.fil_mean_E, payload.fil_mean_T);

    const t = { payload, s }

    PushService.notifyAll({
        title: s.status,
        body: JSON.stringify(t),
        timestamp: Date.now()
    });
    console.log(t);
});

export function sendResetSignal() {
    resetFlag = "1";
}

export function getSuccessCount() {
    return successCount;
}
