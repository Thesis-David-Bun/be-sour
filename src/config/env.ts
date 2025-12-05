import dotenv from "dotenv";
dotenv.config();

export const ENV = {
    MQTT_USER: process.env.MQTT_USER!,
    MQTT_PASS: process.env.MQTT_PASS!,
    MQTT_HOST: process.env.MQTT_HOST!,
    MQTT_PORT: process.env.MQTT_PORT || "8883",

    VAPID_PUBLIC: process.env.PUBLIC_KEY!,
    VAPID_PRIVATE: process.env.PRIVATE_KEY!,
};

export const MQTT_TOPICS = {
    SENSOR: "/test",
    RESET: "/is_reset",
    SUCCESS: "/success"
};