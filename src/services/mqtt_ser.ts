import mqtt from "mqtt";
import { ENV } from "../config/env.js";
import { MQTT_TOPICS } from "../config/env.js";
import { PushService } from "./web_push.js";
import { FuzzyLogic } from "../FuzzyLogic/FuzzyLogic.js";
import { Q } from "../FuzzyLogic/FuzzyEnv.js";

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

interface payload {
    fil_mean_H: number;
    fil_mean_E: number;
    fil_mean_T: number;
    raw_mean_H: number;
    raw_mean_E: number;
    raw_mean_T: number;
    status: string;
    crisp: number;
    isNotify: boolean;
}

let currentPayload: payload = {
    fil_mean_E: 0,
    fil_mean_H: 0,
    fil_mean_T: 0,
    raw_mean_E: 0,
    raw_mean_H: 0,
    raw_mean_T: 0,
    status: '',
    crisp: 0,
    isNotify: false,
};

const defPayload: payload = currentPayload;
let prevPayload: payload = currentPayload;

mqttClient.on("message", (topic, msg) => {
    const message = msg.toString();

    let payload = JSON.parse(message);
    // payload.fil_mean_H = Math.round((150 - payload.fil_mean_H) * 100) / 100;
    // payload.raw_mean_H = Math.round((150 - payload.raw_mean_H) * 100) / 100;

    if (resetFlag === "1") {
        FL.reset(payload);
        resetFlag = "0";
        successCount++;
        currentPayload = defPayload;
        prevPayload = defPayload;
    }

    FL.raw_input_pre_processing(payload);
    const input_fl = FL.input_pre_processing(Q);
    const s = FL.infer(input_fl);
    payload.status = s.status;
    payload.crisp = s.crisp;
    payload.isNotify = s.isNotify;

    prevPayload = currentPayload;
    currentPayload = payload;

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
