import type { FuzzyInput, FuzzyOutput, FuzzyState, RawFuzzyInput } from "./FuzzyEnv.js";
import { MAP, P, Q, Q_def } from "./FuzzyEnv.js";
import { MQ3Processor } from "./MQ3_calib.js";
// FuzzyLogic.ts
// Pure Mamdani fuzzy logic implementation (no device state)

export class FuzzyLogic {
    private OUT_STEPS = 20;
    // ===== Membership Helpers =====
    // linear ramp from 0 at x0 to 1 at x1
    private riseLinear(x: number, x0: number, x1: number): number {
        if (x <= x0) return 0;
        if (x >= x1) return 1;
        return (x - x0) / (x1 - x0);
    }

    // linear ramp from 1 at x0 down to 0 at x1
    private fallLinear(x: number, x0: number, x1: number): number {
        if (x <= x0) return 1;
        if (x >= x1) return 0;
        return (x1 - x) / (x1 - x0);
    }

    // triangular MF centered at mid with base [a, c] and peak at b
    private tri(x: number, a: number, b: number, c: number) {
        if (x <= a || x >= c) return 0;
        if (x === b) return 1;
        if (x < b) return (x - a) / (b - a);
        return (c - x) / (c - b);
    }

    private trapezoid(x: number, a: number, b: number, c: number, d: number) {
        if (x <= a || x >= d) return 0;
        if (x >= b && x <= c) return 1;
        if (x > a && x < b) return (x - a) / (b - a);
        // x > c && x < d
        return (d - x) / (d - c);
    }

    // ===== INPUT MEMBERSHIP =====
    // Temperature
    private tempCold(T: number) {
        return this.fallLinear(T, P.T_low_max - 4, P.T_med_min);
    }
    private tempWarm(T: number) {
        const mid = ((P.T_med_min - 1) + (P.T_med_max + 1)) * 0.5;
        return this.tri(T, P.T_med_min - 1, mid, P.T_med_max + 1);
    }
    private tempHot(T: number) {
        return this.riseLinear(T, P.T_high_min, P.T_high_min + 3);
    }

    // Height (deltaH)
    private heightLow(H: number) {
        return this.fallLinear(H, P.H_low_max - 10, P.H_med_min);
    }
    private heightMed(H: number) {
        const mid = (P.H_med_min + P.H_med_max) * 0.5;
        return this.tri(H, P.H_med_min - 2, mid, P.H_med_max + 2);
    }
    private heightHigh(H: number) {
        return this.riseLinear(H, P.H_high_min - 5, P.H_high_min + 5);
    }

    // Ethanol
    // private ethLow(E: number) {
    //     return this.fallLinear(E, P.E_low_max, P.E_med_min);
    // }
    // private ethMed(E: number) {
    //     const mid = (P.E_med_max + P.E_med_min) * 0.5;
    //     return this.tri(E, P.E_med_min, mid, P.E_med_max);
    // }
    // private ethHigh(E: number) {
    //     return this.riseLinear(E, P.E_high_min, P.E_high_min + 200);
    // }

    private ethLow(E: number) {
        return this.riseLinear(E, 5.149, 13.71);
    }
    private ethMed(E: number) {
        return this.tri(E, 2.814, (2.814 + 5.14) / 2, 5.14);
    }
    private ethHigh(E: number) {
        return this.fallLinear(E, 1.556, 3.00);
    }

    // Rise Rate: Falling / Stagnant / Rising
    private rrFalling(RR: number) {
        // strong falling below P_RR_fall-1
        return this.fallLinear(RR, P.RR_fall, P.RR_fall + 0.5);
    }
    private rrStagnant(RR: number) {
        // trapezoid around [-P_RR_dead_margin..+P_RR_dead_margin]
        const a = P.RR_fall / 2; // negative
        const d = P.RR_rise / 2; // positive
        return this.trapezoid(RR, a, -P.RR_dead_margin, P.RR_dead_margin, d);
    }
    private rrRising(RR: number) {
        return this.riseLinear(RR, P.RR_rise - 0.5, P.RR_rise);
    }

    // Stagnation Counter fuzzy
    private scLow(SC: number) {
        return this.fallLinear(SC, P.SC_low, P.SC_med);
    }
    private scMed(SC: number) {
        return this.tri(SC, P.SC_low, P.SC_med, P.SC_high);
    }
    private scHigh(SC: number) {
        return this.riseLinear(SC, P.SC_high - 1, P.SC_high);
    }

    // Peak Achieved (0..1) -> binaryish fuzzy
    private paNo(pa: number) { return (1 - pa); }
    private paYes(pa: number) { return pa * 0.7; }

    // ===== OUTPUT MEMBERSHIP =====
    private mfFeedAgain(x: number) { return this.tri(x, 0.10, 0.25, 0.40); }
    private mfPostPeak(x: number) { return this.tri(x, 0.35, 0.45, 0.55); }
    private mfNotReady(x: number) { return this.tri(x, 0.50, 0.65, 0.80); } // Puncak di 0.65
    private mfReady(x: number) { return this.trapezoid(x, 0.75, 0.90, 1.0, 1.1); }    // Puncak di 0.90
    private mfStag(x: number) { return this.trapezoid(x, -0.1, 0, 0.05, 0.15); }

    // ==== PRE / PROCESSING MEMBERSHIP ====
    public reset(x: RawFuzzyInput) {
        Object.keys(Q).forEach(key => {
            Q[key] = Q_def[key];
        });
        P.stagnationCounter = 0;
        P.last_peak_H = 0;
        P.has_peaked = 0;
        P.is_delta = false;
        P.is_feeding = true;

        const deltaH = P.bottonJarValue - Math.round(x.raw_mean_H);
        P.H_low_max = deltaH + 2;
        P.H_med_min = deltaH + 2;
        P.H_med_max = (deltaH + 2) * 3;
        P.H_high_min = (deltaH + 2) * 3;
        console.log(P.H_low_max);
        console.log(P.H_high_min);
    }

    public raw_input_pre_processing(x: RawFuzzyInput) {
        if (P.is_delta) {
            Q.prev_fil_mean_E = Q.fil_mean_E;
            Q.prev_fil_mean_H = Q.fil_mean_H;
            Q.prev_fil_mean_T = Q.fil_mean_T;
            Q.prev_raw_mean_E = Q.raw_mean_E;
            Q.prev_raw_mean_H = Q.raw_mean_H;
            Q.prev_raw_mean_T = Q.raw_mean_T;
        }
        Q.fil_mean_E = x.fil_mean_E;
        Q.fil_mean_H = x.fil_mean_H;
        Q.fil_mean_T = x.fil_mean_T;
        Q.raw_mean_E = x.raw_mean_E;
        Q.raw_mean_H = x.raw_mean_H;
        Q.raw_mean_T = x.raw_mean_T;
        if (!P.is_delta) {
            P.is_delta = true;
        }
    }

    public input_pre_processing(x: RawFuzzyInput): FuzzyInput {
        const deltaH = Math.round((P.bottonJarValue - x.raw_mean_H) * 100) / 100;
        const prev_deltaH = x.prev_raw_mean_H !== 0 ? Math.round((P.bottonJarValue - x.prev_raw_mean_H) * 100) / 100 : 0;
        if (Math.abs(deltaH - prev_deltaH) <= 0) {
            P.stagnationCounter += 1;
        } else {
            P.stagnationCounter = 0;
        }

        if ((deltaH > P.last_peak_H)) {
            P.last_peak_H = deltaH;
        }

        if (((deltaH - prev_deltaH) <= -5) && (P.last_peak_H > 0) && !Math.round(P.has_peaked)) {
            P.has_peaked = 1;
        }

        if ((deltaH - P.last_peak_H) < 2 && Math.round(P.has_peaked)) {
            P.has_peaked = 0;
        }

        if (deltaH >= P.overflowHeightThreshold) {
            P.is_overflow = 1;
        }

        const ro = MQ3Processor.calculateRo(261);
        return {
            tempC: x.raw_mean_T,
            deltaH: deltaH,
            ethanol: MQ3Processor.getRatio(x.raw_mean_E, ro),
            peakAchieved: P.has_peaked,
            riseRate: Math.round((deltaH - prev_deltaH) * 100) / 100,
            stagnationCounter: P.stagnationCounter,
            overFlow: P.is_overflow
        };
    }

    // ===== INFERENCE =====
    public infer(input: FuzzyInput, y: boolean): FuzzyOutput {
        const { tempC, deltaH, ethanol, riseRate, stagnationCounter, peakAchieved } = input;
        // 1. Evaluate membership degrees
        const T_cold = this.tempCold(tempC);
        const T_warm = this.tempWarm(tempC);
        const T_hot = this.tempHot(tempC);

        const H_low = this.heightLow(deltaH);
        const H_med = this.heightMed(deltaH);
        const H_high = this.heightHigh(deltaH);

        const E_low = this.ethLow(ethanol);
        const E_med = this.ethMed(ethanol);
        const E_high = this.ethHigh(ethanol);

        const RR_fall = this.rrFalling(riseRate);
        const RR_stag = this.rrStagnant(riseRate);
        const RR_rise = this.rrRising(riseRate);

        const SC_low = this.scLow(stagnationCounter);
        const SC_med = this.scMed(stagnationCounter);
        const SC_high = this.scHigh(stagnationCounter);

        const PA_no = this.paNo(peakAchieved);
        const PA_yes = this.paYes(peakAchieved);

        // 2) rule activations (Mamdani antecedents)
        // A. READY family
        const r_readyUrg = Math.min(T_hot, H_high, E_high, Math.max(RR_rise, PA_yes));      // BENAR R_READY
        const r_ready = Math.min(T_warm, H_high, E_high, Math.max(RR_rise, PA_yes));     // BENAR R_READY
        const r_readyOpt = Math.min(T_cold, H_high, E_high, Math.max(RR_rise, PA_yes));     // BENAR R_READY

        // B. FEED / NOT READY family
        const r_feedFromMed = Math.min(H_med, Math.max(E_med, E_high), Math.max(RR_rise, RR_fall), PA_yes); // BENER R_FEED_AGAIN  medium rise + ethanol -> feed suggested
        const r_notReadyEarly = Math.min(H_med, Math.max(E_med, E_low, E_high), Math.max(RR_rise, RR_fall)); // BENER R_NOT_READY
        const r_feedWeak = Math.min(H_high, Math.max(E_low, E_med)); // BENAR R_FEED_AGAIN

        // C. FALL / COLLAPSE (after peak)
        const r_postPeak = Math.min(RR_fall, PA_yes, Math.max(H_med, H_high), Math.max(E_med, E_high));

        // D. STAGNATION & DEAD
        const r_dead2 = Math.min(Math.max(RR_stag, RR_fall), E_low, Math.max(SC_med, SC_high)); // R_STAGNANT stagnant mid-rise, high ethanol, never peaked -> likely dead

        // E. JUST-FED / NOT_READY
        const r_justFed1 = Math.min(H_low, Math.max(E_low, E_med)); // r_not_ready
        const r_fallAfterPeak = Math.min(RR_fall, Math.max(H_high, H_med), PA_yes, Math.max(E_high, E_med)); // BENER R_POST_PEAK
        const r_justFed2 = Math.min(H_low, Math.max(E_med), SC_low); // BENER R_NOT_READY
        // const r_dead1 = Math.min(Math.max(RR_stag, RR_fall), E_high, SC_high); // stagnant + high ethanol + many stagnant -> dead

        if (y) {
            console.log(input);
            console.log('T_cold :' + T_cold);
            console.log('T_hot :' + T_hot);
            console.log('T_warm :' + T_warm);

            console.log('H_low :' + H_low);
            console.log('H_med :' + H_med);
            console.log('H_high :' + H_high);

            console.log('E_low :' + E_low);
            console.log('E_med :' + E_med);
            console.log('E_high :' + E_high);

            console.log('RR_fall :' + RR_fall);
            console.log('RR_stag :' + RR_stag);
            console.log('RR_rise :' + RR_rise);

            console.log('SC_low :' + SC_low);
            console.log('SC_med :' + SC_med);
            console.log('SC_high :' + SC_high);

            console.log('PA_no :' + PA_no);
            console.log('PA_yes :' + PA_yes);

            console.log('r_ready :' + r_ready);
            console.log('r_readyUrg :' + r_readyUrg);
            console.log('r_readyOpt :' + r_readyOpt);
            console.log('r_feedFromMed :' + r_feedFromMed);
            console.log('r_notReadyEarly :' + r_notReadyEarly);
            console.log('r_feedWeak :' + r_feedWeak);
            console.log('r_fallAfterPeak :' + r_fallAfterPeak);
            console.log('r_postPeak :' + r_postPeak);
            // console.log('r_dead1 :' + r_dead1);
            console.log('r_dead2 :' + r_dead2);
            console.log('r_justFed1 :' + r_justFed1);
            console.log('r_justFed2 :' + r_justFed2);
        }

        // 3. Mamdani Aggregation + Defuzzification
        // let num = 0, den = 0;
        let status: FuzzyState;
        let maxMu = -1;
        let bestX: number[] = [];
        for (let i = 0; i <= this.OUT_STEPS; i++) {
            const x = i / this.OUT_STEPS;
            const mu_ready1 = Math.min(Math.max(r_readyUrg, r_ready, r_readyOpt), this.mfReady(x));
            const mu_notReadyEarly = Math.min(Math.max(r_justFed1, r_justFed2, r_notReadyEarly), this.mfNotReady(x));
            const mu_stag = Math.min(r_dead2, this.mfStag(x));
            const mu_postPeak1 = Math.min(Math.max(r_postPeak), this.mfPostPeak(x));
            const mu_postPeak2 = Math.min(Math.max(r_fallAfterPeak), this.mfPostPeak(x));
            const mu_feed = Math.min(Math.max(r_feedFromMed, r_feedWeak), this.mfFeedAgain(x));
            // aggregate 
            const mu = Math.max(mu_ready1, mu_notReadyEarly, mu_stag, mu_feed, mu_postPeak1, mu_postPeak2);

            if (mu > maxMu) {
                maxMu = mu;
                bestX = [x];
            } else if (mu === maxMu && mu > 0) {
                bestX.push(x);
            }
        }
        const crisp = bestX.length > 0 ? bestX.reduce((a, b) => a + b, 0) / bestX.length : 0;

        if (y) {
            console.log(bestX);
        }
        console.log(crisp);
        // // 4. Crisp → Category
        if (crisp >= 0.77) status = "READY";
        else if (crisp >= 0.55) status = "NOT_READY";
        else if (crisp >= 0.35) status = "POST_PEAK";
        else if (crisp >= 0.15) status = "FEED_AGAIN";
        else status = "STAGNANT";

        // if (crisp >= MAP.READY) status = "READY";
        // else if (crisp >= MAP.NOTREADY) status = "NOT_READY";
        // else if (crisp >= MAP.POST) status = "POST_PEAK";
        // else if (crisp >= MAP.FEED) status = "FEED_AGAIN";
        // else status = "STAGNANT";

        console.log(status);
        let isNotify = false;
        if (status === 'READY') {
            isNotify = true;
            P.is_feeding = false;
        } else if (P.is_overflow === 1) {
            isNotify = true;
            status = 'OVERFLOW';
        } else if (P.has_peaked && status === 'POST_PEAK') {
            isNotify = true;
        }
        return { crisp, status, isNotify };
    }
}
