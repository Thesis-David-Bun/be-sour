import fs from "fs";
import path from "path";

import mqtt from "mqtt";
import { ENV } from "../config/env.js";
import { MQTT_TOPICS } from "../config/env.js";
import { PushService } from "./web_push.js";
import { FuzzyLogic } from "../FuzzyLogic/FuzzyLogic.js";
import { Q } from "../FuzzyLogic/FuzzyEnv.js";

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
    timestamp: number;
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
    timestamp: 0,
};

const defPayload: payload = currentPayload;
let prevPayload: payload = currentPayload;

let resetFlag = "0";
let successCount = 0;

const clientId = "Sourdough-" + Math.random().toString(16).slice(2);
const url = `mqtts://${ENV.MQTT_HOST}:${ENV.MQTT_PORT}`;

const FL = new FuzzyLogic();

const EXTRA_PAYLOAD_PATH = "./log/extra_payload.json";
const COPY_OF_PAYLOAD_PATH = "./log/copy_of_extra.json";
function appendPayloadToJsonFile(filePath: string, newPayload: any) {
    try {
        const absolutePath = path.resolve(filePath);
        let data: any[] = [];

        if (fs.existsSync(absolutePath)) {
            const raw = fs.readFileSync(absolutePath, "utf-8");
            const parsed = JSON.parse(raw);

            if (Array.isArray(parsed)) {
                data = parsed;
            } else {
                throw new Error("JSON file is not an array");
            }
        }
        data.push(newPayload);
        fs.writeFileSync(
            absolutePath,
            JSON.stringify(data, null, 2),
            "utf-8"
        );
    } catch (err) {
        console.error("Failed to append payload to JSON:", err);
    }
}

function rerun_infer(filePath: string) {
    try {
        const absolutePath = path.resolve(filePath);
        let data: any[] = [];
        let payload: payload;

        if (fs.existsSync(absolutePath)) {
            const raw = fs.readFileSync(absolutePath, "utf-8");
            const parsed = JSON.parse(raw);

            if (Array.isArray(parsed)) {
                data = parsed;
            } else {
                throw new Error("JSON file is not an array");
            }
        }

        data.forEach((e: payload) => {
            payload = e;
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
            payload.timestamp = Date.now();
            prevPayload = currentPayload;
            currentPayload = payload;
            appendPayloadToJsonFile(EXTRA_PAYLOAD_PATH, payload);
        });
    } catch (err) {
        console.error("Failed to append payload to JSON:", err);
    }
}

function moveAndResetJsonArray(sourcePath: string, destinationPath: string) {
    try {
        const src = path.resolve(sourcePath);
        const dst = path.resolve(destinationPath);
        let sourceData: any[] = [];

        if (fs.existsSync(src)) {
            const raw = fs.readFileSync(src, "utf-8");
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error("Source JSON is not an array");
            }
            sourceData = parsed;
        }

        fs.writeFileSync(
            dst,
            JSON.stringify(sourceData, null, 2),
            "utf-8"
        );

        fs.writeFileSync(
            src,
            JSON.stringify([], null, 2),
            "utf-8"
        );
    } catch (err) {
        console.error("Failed to move and reset JSON:", err);
    }
}

export const mqttClient = mqtt.connect(url, {
    clientId,
    clean: true,
    username: ENV.MQTT_USER,
    password: ENV.MQTT_PASS,
});

mqttClient.on("connect", () => {
    // resetFlag = "1";
    console.log("MQTT Connected");

    mqttClient.subscribe(MQTT_TOPICS.SENSOR, err => {
        if (err) console.error("MQTT subscription error:", err);
    });

    // moveAndResetJsonArray(EXTRA_PAYLOAD_PATH, COPY_OF_PAYLOAD_PATH);
    // rerun_infer(COPY_OF_PAYLOAD_PATH);
});

mqttClient.on("message", (topic, msg) => {
    const message = msg.toString();
    let payload = JSON.parse(message);

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
    payload.timestamp = Date.now();

    prevPayload = currentPayload;
    currentPayload = payload;

    PushService.notifyAll({
        title: s.status,
        body: JSON.stringify(payload),
        timestamp: Date.now()
    });
    printJSON(payload);
    printJSON(input_fl);

    // appendPayloadToJsonFile(EXTRA_PAYLOAD_PATH, payload);
});

function printJSON(x: any) {
    console.log('{');
    Object.keys(x).forEach(key => {
        console.log('  ' + key + " : " + x[key]);
    });
    console.log('}');
}

export function sendResetSignal() {
    resetFlag = "1";
}

export function getSuccessCount() {
    return successCount;
}
