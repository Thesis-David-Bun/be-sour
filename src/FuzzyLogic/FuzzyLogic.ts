// FuzzyLogic.ts
// Pure Mamdani fuzzy logic implementation (no device state)

export type FuzzyOutput =
    | "READY"
    | "READY_URGENT"
    | "READY_OPTIONAL"
    | "NOT_READY"
    | "FEED_AGAIN";

export class FuzzyLogic {
    private OUT_STEPS = 200;

    private P = {
        // --- Fuzzy thresholds (inputs) ---
        // Temperature (°C)
        T_low_max: 29.0,
        T_med_min: 29.0,
        T_med_max: 33.0,
        T_high_min: 33.0,

        // Delta height (mm)
        H_low_max: 160.0,
        H_med_min: 160.0,
        H_med_max: 140.0,
        H_high_min: 140.0,

        // Ethanol (assume scaled 0..4095 OR ppm), thresholds chosen as raw ADC-ish
        E_low_max: 2000.0,
        E_med_min: 2000.0,
        E_med_max: 3000.0,
        E_high_min: 3000.0,

        overflowHeightThreshold: 90,
        ethanolSaturateValue: 4095, // raw ADC saturation
        ethanolSaturateNeeded: 3, // count threshold

        // For rise/fall detection (compare last delta to current)
        riseEpsilon: 0.5,  // mm difference to consider change
        fallEpsilon: -0.5,
        // Small meaningful rise
        minMeaningfulDelta: 0.1,  // mm
    };

    // ===== Membership Helpers =====
    private riseLinear(x: number, x0: number, x1: number): number {
        if (x <= x0) return 0;
        if (x >= x1) return 1;
        return (x - x0) / (x1 - x0);
    }

    private fallLinear(x: number, x0: number, x1: number): number {
        if (x <= x0) return 1;
        if (x >= x1) return 0;
        return (x1 - x) / (x1 - x0);
    }

    // ===== INPUT MEMBERSHIP =====
    // Temperature
    private tempCold(T: number) {
        return this.fallLinear(T, this.P.T_low_max, this.P.T_med_min);
    }
    private tempWarm(T: number) {
        const mid = (this.P.T_med_min + this.P.T_med_max) * 0.5;
        return Math.min(
            this.riseLinear(T, this.P.T_med_min, mid),
            this.fallLinear(T, mid, this.P.T_med_max)
        );
    }
    private tempHot(T: number) {
        return this.riseLinear(T, this.P.T_high_min, this.P.T_high_min + 3);
    }

    // Height (deltaH)
    private riseLow(H: number) {
        return this.fallLinear(H, this.P.H_low_max, this.P.H_med_min);
    }
    private riseMed(H: number) {
        const mid = (this.P.H_med_min + this.P.H_med_max) * 0.5;
        return Math.min(this.riseLinear(H, this.P.H_med_min, mid), this.fallLinear(H, mid, this.P.H_med_max));
    }
    private riseHigh(H: number) {
        return this.riseLinear(H, this.P.H_high_min, this.P.H_high_min + 10);
    }

    // Ethanol
    private ethLow(E: number) {
        return this.fallLinear(E, this.P.E_low_max, this.P.E_med_min);
    }
    private ethMed(E: number) {
        const mid = (this.P.E_med_max + this.P.E_med_min) * 0.5;
        return Math.min(this.riseLinear(E, this.P.E_med_min, mid), this.fallLinear(E, mid, this.P.E_med_max));
    }
    private ethHigh(E: number) {
        return this.riseLinear(E, this.P.E_high_min, this.P.E_high_min + 200);
    }

    // ===== OUTPUT MEMBERSHIP =====
    private mfReady(x: number) {
        return this.riseLinear(x, 0.60, 0.80);
    }
    private mfReadyUrgent(x: number) {
        return this.riseLinear(x, 0.80, 1.00);
    }
    private mfReadyOptional(x: number) {
        return this.riseLinear(x, 0.40, 0.60);
    }
    private mfNotReady(x: number) {
        return this.riseLinear(x, 0.20, 0.40);
    }
    private mfFeedAgain(x: number) {
        return this.riseLinear(x, 0.00, 0.20);
    }

    private isNotif(x: string) {
        let p = ("READY" === x) || ("READY_URGENT" === x) || ("READY_OPTIONAL" === x);
        if (p) {
            return true;
        }
        return false;
    }

    // ===== HARD CODE RULES ===== 
    private Q = {
        isRising: false,
        isFalling: false,
        hasPeaked: false,
        last_H: 0,
        peak_H: 0,
        eth_count: 0,
        no_rise_count: 0,
    }

    private safetyRules(H: number, E: number, T: number) {
        const diff = this.Q.last_H - H;

        if (diff >= this.P.riseEpsilon) {
            this.Q.isRising = true;
        } else if (diff < this.P.fallEpsilon) {
            this.Q.isFalling = true;
        } else if (Math.abs(diff) <= this.P.minMeaningfulDelta) {
            this.Q.isRising = false;
        }

        if (this.Q.isRising) {
            if (H > this.Q.peak_H) {
                this.Q.peak_H = H;
            }
            this.Q.no_rise_count = 0;
            this.Q.hasPeaked = false;
        } else {
            if (this.Q.isFalling && (this.Q.peak_H > 0) && !this.Q.hasPeaked) {
                this.Q.hasPeaked = true;
            }

            if (Math.abs(diff) <= this.P.minMeaningfulDelta) {
                this.Q.no_rise_count += 1;
            }
        }

        if (E >= this.P.ethanolSaturateValue) {
            this.Q.eth_count += 1;
        } else {
            this.Q.eth_count = 0;
        }

        if (H <= this.P.overflowHeightThreshold || this.Q.eth_count >= this.P.ethanolSaturateNeeded) {
            return { status: true, data: { crisp: -1, status: "OVERFLOW", isNotify: true } };
        }

        if (this.Q.no_rise_count >= 6) {
            return { status: true, data: { crisp: -1, status: "REFEED", isNotify: true } };
        }

        return { status: false, data: { crisp: -1, status: "", isNotify: false } };
    }

    public reset_Q() {
        this.Q = {
            isRising: false,
            isFalling: false,
            hasPeaked: false,
            last_H: 0,
            peak_H: 0,
            eth_count: 0,
            no_rise_count: 0,
        };
    }

    // ===== INFERENCE =====
    public infer(H: number, E: number, T: number) {
        const temp = this.safetyRules(H, E, T);
        if (temp.status) {
            return temp.data;
        }

        // 1. Evaluate membership degrees
        const C = this.tempCold(T);
        const W = this.tempWarm(T);
        const Ht = this.tempHot(T);

        const RL = this.riseHigh(H);
        const RM = this.riseMed(H);
        const RH = this.riseLow(H);

        const EL = this.ethLow(E);
        const EM = this.ethMed(E);
        const EH = this.ethHigh(E);

        // 2. Rule Base
        const r_ready = Math.min(W, Math.min(RH, EH));
        const r_readyOpt = Math.min(C, Math.min(RH, EH));
        const r_readyUrg = Math.min(Ht, Math.min(RH, EH));
        const r_feedAgain = Math.min(RM, Math.max(EM, EH));
        const r_notReady = Math.min(RL, Math.max(EM, EH));

        // 3. Mamdani Aggregation + Centroid Defuzzification
        let num = 0, den = 0;
        for (let i = 0; i <= this.OUT_STEPS; i++) {
            const x = i / this.OUT_STEPS;
            const miu_ready = Math.min(r_ready, this.mfReady(x));
            const miu_readyUrg = Math.min(r_readyUrg, this.mfReadyUrgent(x));
            const miu_readyOpt = Math.min(r_readyOpt, this.mfReadyOptional(x));
            const miu_notReady = Math.min(r_notReady, this.mfNotReady(x));
            const miu_feedAgain = Math.min(r_feedAgain, this.mfFeedAgain(x));

            const miu = Math.max(miu_ready, Math.max(miu_readyUrg, Math.max(miu_readyOpt, Math.max(miu_notReady, miu_feedAgain))));

            num += x * miu;
            den += miu;
        }

        const crisp = den === 0 ? 0 : num / den;

        // 4. Crisp → Category
        let state: FuzzyOutput = "FEED_AGAIN";
        if (crisp > 0.85) state = "READY_URGENT";
        else if (crisp > 0.70) state = "READY";
        else if (crisp > 0.55) state = "READY_OPTIONAL";
        else if (crisp > 0.30) state = "NOT_READY";

        let isNotify = this.isNotif(state);
        return { crisp, status: state, isNotify };
    }
}
