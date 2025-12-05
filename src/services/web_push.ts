import webpush from "web-push";
import { ENV } from "../config/env";
import { SubscriptionService } from "./subs";

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
