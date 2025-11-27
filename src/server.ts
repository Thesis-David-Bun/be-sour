import dotenv from "dotenv";
dotenv.config();

import express from "express"
import bodyParser from "body-parser"
import cors from "cors"
import mqtt from "mqtt"
import webpush from "web-push"

// --- CONFIG ---
const protocol = 'mqtts'
const host = 'c8655e388ba0426a84f2197ce7a2e4ff.s1.eu.hivemq.cloud'
const port = '8883'  // secure websocket port for HiveMQ Cloud
const id_mqtt = 'Petal'
const topic = '/test'
const pass_mqtt = 'iwn8194;opqHhw'

const clientId = `${id_mqtt}-${Math.random().toString(16).substr(2, 8)}`
const connectUrl = `${protocol}://${host}:${port}`


// const VAPID_PUBLIC = "BEnud_hbQRz-B7xHypFu_TXswSWxA03Si_pml7hoJ_R6R6qfkQs4DlZshJQPPhNd6ScI8wnmtqDTpbKeOg3GQbU"
// const VAPID_PRIVATE = "97uoLh9Z9fOcfqQkiakrZXJGbEQ0IlQVbQ561ZJuzeY"
const VAPID_PUBLIC = process.env.PUBLIC_KEY
const VAPID_PRIVATE = process.env.PRIVATE_KEY

// --- Web Push Setup ---
webpush.setVapidDetails(
    "mailto:david.bunyamin.99@gmail.com",  // <-- FIXED
    VAPID_PUBLIC,
    VAPID_PRIVATE
)

// In-memory storage for demo
let subscriptions: any[] = []

// --- Express Setup ---
const app = express()
app.use(cors())
app.use(bodyParser.json())

app.post("/subscribe", (req, res) => {
    const sub = req.body;

    const exists = subscriptions.find(s => s.endpoint === sub.endpoint);
    if (!exists) {
        subscriptions.push(sub);
    }

    res.status(201).json({ message: "Subscription saved." });
});

app.get("/subs", (req, res) => {
    res.json(subscriptions)
})

// --- MQTT Client ---
const mqttClient = mqtt.connect(connectUrl, {
    clientId,
    clean: true,
    username: id_mqtt,
    password: pass_mqtt,
})

mqttClient.on("connect", () => {
    console.log("MQTT connected")
    mqttClient.subscribe(topic)
    // const data = []
    // const jsonString = JSON.stringify(data, null, 4)
    // const filePath = 'log/output_' + new Intl.DateTimeFormat('id-ID', {
    //     year: "numeric",
    //     month: '2-digit',
    //     day: '2-digit',
    // }).format(new Date()).replaceAll('/', '-') + '.json'
    // if (fs.existsSync(filePath)) {
    //     console.log('File exist ' + filePath)
    // } else {
    //     fs.writeFile(filePath, jsonString, (err) => {
    //         if (err) {
    //             console.error('Error: ', err)
    //         } else {
    //             console.log('Success creating file ' + filePath)
    //         }
    //     })
    // }
})

let payloads: any = []
// let count: number = 0

mqttClient.on("message", (topic, message) => {
    const payload = message.toString()
    console.log(`${topic}: ${payload}`)
    payloads.push(JSON.parse(payload))
    // count++
    // if ((JSON.parse(payload).n === 11)) {
    //     const filePath = 'log/output_' + new Intl.DateTimeFormat('id-ID', {
    //         year: "numeric",
    //         month: '2-digit',
    //         day: '2-digit',
    //     }).format(new Date()).replaceAll('/', '-') + '.json'
    //     fs.readFile(filePath, (err, data: any) => {
    //         let jsonData = JSON.parse(data)

    //         payloads.push({
    //             'time': new Intl.DateTimeFormat('id-ID', {
    //                 year: "numeric",
    //                 month: '2-digit',
    //                 day: '2-digit',
    //                 hour: '2-digit',
    //                 minute: '2-digit',
    //                 second: '2-digit',
    //             }).format(new Date())
    //         })
    //         jsonData.push(payloads)
    //         fs.writeFile(filePath, JSON.stringify(jsonData), (err) => {
    //             if (err) {
    //                 console.error('Writing Error: ', err)
    //             } else {
    //                 console.log('Success writing output file ' + filePath)
    //             }
    //         })
    //         if (err) {
    //             console.error('Reading Error: ', err)
    //         } else {
    //             console.log('Success reading a file ' + filePath)
    //         }

    //         count = 0;
    //         payloads = []
    //     })
    // } else {
    //     count = 0;
    //     payloads = []
    // }

    subscriptions.forEach(sub => {
        webpush.sendNotification(
            sub,
            JSON.stringify({
                title: JSON.parse(payload).status,
                body: payload,
                data: { timestamp: Date.now() }
            })
        ).catch(err => console.error("Push error:", err))
    })
})

// --- Start Server ---
app.listen(3000, () => {
    console.log("Backend running on http://localhost:3000")
    // console.log(VAPID_PUBLIC)
    // console.log(VAPID_PRIVATE)
})