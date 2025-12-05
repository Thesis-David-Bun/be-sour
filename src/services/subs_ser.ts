export class SubscriptionService {
    private static subs: any[] = [];

    static add(sub: any) {
        if (!this.subs.find(s => s.endpoint === sub.endpoint)) {
            this.subs.push(sub);
        }
    }

    static getAll() {
        return this.subs;
    }
}
