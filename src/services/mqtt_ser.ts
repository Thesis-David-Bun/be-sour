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

    let payload = JSON.parse(message);

    if (resetFlag === "1") {
        FL.reset_Q();
        resetFlag = "0";
        successCount++;
    }
    const s = FL.infer(payload.fil_mean_H, payload.fil_mean_E, payload.fil_mean_T);
    payload.status = s.status;
    payload.crisp = s.crisp;

    PushService.notifyAll({
        title: s.status,
        body: JSON.stringify(payload),
        timestamp: Date.now()
    });
    console.log(payload);
});

export function sendResetSignal() {
    resetFlag = "1";
}

export function getSuccessCount() {
    return successCount;
}
