import webpush from "web-push";
import { ENV } from "../config/env.js";
import { SubscriptionService } from "./subs_ser.js";

webpush.setVapidDetails(
    "mailto:example@sourdough.com",
    ENV.VAPID_PUBLIC,
    ENV.VAPID_PRIVATE
);

export class PushService {
    static notifyAll(payload: any) {
        SubscriptionService.getAll().forEach(sub => {
            webpush.sendNotification(sub, JSON.stringify(payload))
                .catch(err => console.error("Push error:", err));
        });
    }
}
