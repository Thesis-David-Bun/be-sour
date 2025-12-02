import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mqtt from "mqtt";
import webpush from "web-push";

// --- CONFIG ---
const protocol = "mqtts";
const host = "c8655e388ba0426a84f2197ce7a2e4ff.s1.eu.hivemq.cloud";
const port = "8883";

const id_mqtt = "Petal";
const pass_mqtt = "iwn8194;opqHhw";

const TOPIC_SENSOR = "/test";
const TOPIC_RESET = "/is_reset";
const TOPIC_SUCCESS = "/success";

const clientId = `${id_mqtt}-${Math.random().toString(16).substr(2, 8)}`;
const connectUrl = `${protocol}://${host}:${port}`;

const VAPID_PUBLIC = process.env.PUBLIC_KEY;
const VAPID_PRIVATE = process.env.PRIVATE_KEY;

// Validate VAPID
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("⚠ Missing VAPID keys. Push notifications may fail.");
}

// --- Web Push Setup ---
webpush.setVapidDetails(
    "mailto:david.bunyamin.99@gmail.com",
    VAPID_PUBLIC!,
    VAPID_PRIVATE!
);

// -- Storage --
let subscriptions: any[] = [];
let lastPayload: any = null;
let resetFlag = "0";
let count = 0;

// --- Express ---
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Store subscription
app.post("/subscribe", (req, res) => {
    const sub = req.body;
    if (!subscriptions.find(s => s.endpoint === sub.endpoint)) {
        subscriptions.push(sub);
    }
    res.status(201).json({ message: "Subscription saved." });
});

// Show subs
app.get("/subs", (req, res) => {
    res.json(subscriptions);
});

// Return device / backend status
app.get("/status", (req, res) => {
    res.json({
        count
    });
});

// Publish a message to MQTT
app.post("/publish", (req, res) => {
    resetFlag = "1";
    res.json({ success: true });
    // const { topic, message } = req.body;

    // if (!topic || !message) {
    //     return res.status(400).json({ error: "topic and message required" });
    // }

    // mqttClient.publish(topic, message, { qos: 0 }, (err) => {
    //     if (err) {
    //         console.error("MQTT publish error:", err);
    //         return res.status(500).json({ error: "Publish failed" });
    //     }
    //     console.log(`Published → ${topic}: ${message}`);
    //     res.json({ success: true });
    // });
});

// Dedicated RESET endpoint
// app.post("/reset", (req, res) => {
// });

// --- MQTT Client ---
const mqttClient = mqtt.connect(connectUrl, {
    clientId,
    clean: true,
    username: id_mqtt,
    password: pass_mqtt,
});

mqttClient.on("connect", () => {
    console.log("MQTT connected");

    mqttClient.subscribe([TOPIC_SENSOR, TOPIC_RESET, TOPIC_SUCCESS], (err) => {
        if (err) {
            console.error("Subscription error:", err);
        } else {
            console.log("Subscribed to all topics");
        }
    });
});

// Handle MQTT messages
mqttClient.on("message", (topic, msg) => {
    const message = msg.toString();
    console.log(`${topic}: ${message}`);

    if (topic === TOPIC_SENSOR) {
        lastPayload = JSON.parse(message);

        // notify clients
        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, JSON.stringify({
                title: lastPayload.status,
                body: message,
                data: { timestamp: Date.now() }
            }))
                .catch(err => console.error("Push error:", err));
        });
    }

    if (topic === TOPIC_SUCCESS) {
        count++;
        console.log("Device acknowledged success");
    }

    if (topic === TOPIC_RESET) {
        mqttClient.publish(TOPIC_RESET, "1", { qos: 0 });
        console.log("Reset command sent!");
        resetFlag = "0";
    }
});

// --- Start Server ---
app.listen(3000, () => {
    console.log("Backend running on http://localhost:3000");
});
