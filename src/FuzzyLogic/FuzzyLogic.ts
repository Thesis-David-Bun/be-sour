import type { FuzzyInput, FuzzyOutput, FuzzyState, RawFuzzyInput } from "./FuzzyEnv.js";
import { MAP, P, Q, Q_def } from "./FuzzyEnv.js";
// FuzzyLogic.ts
// Pure Mamdani fuzzy logic implementation (no device state)

export class FuzzyLogic {
    private OUT_STEPS = 200;
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
        return this.fallLinear(T, P.T_low_max, P.T_med_min);
    }
    private tempWarm(T: number) {
        const mid = (P.T_med_min + P.T_med_max) * 0.5;
        return this.tri(T, P.T_med_min, mid, P.T_med_max);
    }
    private tempHot(T: number) {
        return this.riseLinear(T, P.T_high_min, P.T_high_min + 3);
    }

    // Height (deltaH)
    private heightLow(H: number) {
        return this.fallLinear(H, P.H_low_max, P.H_med_min);
    }
    private heightMed(H: number) {
        const mid = (P.H_med_min + P.H_med_max) * 0.5;
        return this.tri(H, P.H_med_min, mid, P.H_med_max);
    }
    private heightHigh(H: number) {
        return this.riseLinear(H, P.H_high_min, P.H_high_min + 5);
    }

    // Ethanol
    private ethLow(E: number) {
        return this.fallLinear(E, P.E_low_max, P.E_med_min);
    }
    private ethMed(E: number) {
        const mid = (P.E_med_max + P.E_med_min) * 0.5;
        return this.tri(E, P.E_med_min, mid, P.E_med_max);
    }
    private ethHigh(E: number) {
        return this.riseLinear(E, P.E_high_min, P.E_high_min + 200);
    }

    // Rise Rate: Falling / Stagnant / Rising
    private rrFalling(RR: number) {
        // strong falling below P_RR_fall-1
        return this.fallLinear(RR, P.RR_fall - 1, P.RR_fall);
    }
    private rrStagnant(RR: number) {
        // trapezoid around [-P_RR_dead_margin..+P_RR_dead_margin]
        const a = P.RR_fall / 2; // negative
        const d = P.RR_rise / 2; // positive
        return this.trapezoid(RR, a, -P.RR_dead_margin, P.RR_dead_margin, d);
    }
    private rrRising(RR: number) {
        return this.riseLinear(RR, P.RR_rise, P.RR_rise + 1);
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
    private mfFeedAgain(x: number) { return this.riseLinear(x, 0.00, 0.10); }
    private mfNotReady(x: number) { return this.riseLinear(x, 0.20, 0.40); }
    private mfReadyOptional(x: number) { return this.riseLinear(x, 0.40, 0.60); }
    private mfReady(x: number) { return this.riseLinear(x, 0.60, 0.80); }
    private mfReadyUrgent(x: number) { return this.riseLinear(x, 0.80, 1.00); }
    private mfPostPeak(x: number) { return this.tri(x, 0.35, 0.45, 0.55); }
    private mfDead(x: number) { return this.riseLinear(x, 0.00, 0.10); } // small left-end region

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

        const deltaH = P.bottonJarValue - Math.round(x.fil_mean_H);
        P.H_low_max = deltaH;
        P.H_med_min = deltaH;
        P.H_med_max = deltaH * 3;
        P.H_high_min = deltaH * 3;
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
        const deltaH = Math.round((P.bottonJarValue - x.fil_mean_H) * 100) / 100;
        const prev_deltaH = x.prev_fil_mean_H !== 0 ? Math.round((P.bottonJarValue - x.prev_fil_mean_H) * 100) / 100 : 0;
        if (Math.abs(deltaH - prev_deltaH) <= P.minMeaningfulDelta) {
            P.stagnationCounter += 1;
        } else {
            P.stagnationCounter = 0;
        }

        const rise = deltaH - prev_deltaH;
        if ((deltaH > P.last_peak_H)) {
            P.last_peak_H = deltaH;
        }

        if ((rise < P.fallEpsilon) && (P.last_peak_H > 0) && !P.has_peaked && P.is_feeding) {
            P.has_peaked = 1;
        }

        if (deltaH >= P.overflowHeightThreshold) {
            P.is_overflow = 1;
        }

        return {
            tempC: x.fil_mean_T,
            deltaH: deltaH,
            ethanol: x.fil_mean_E,
            peakAchieved: P.has_peaked,
            riseRate: deltaH - prev_deltaH,
            stagnationCounter: P.stagnationCounter,
            overFlow: P.is_overflow
        };
    }

    // ===== INFERENCE =====
    public infer(input: FuzzyInput): FuzzyOutput {
        const { tempC, deltaH, ethanol, riseRate, stagnationCounter, peakAchieved } = input;

        // 1. Evaluate membership degrees
        const T_cold = this.tempCold(tempC);
        const T_warm = this.tempWarm(tempC);
        const T_hot = this.tempHot(tempC);
        console.log('T_cold :' + T_cold);
        console.log('T_hot :' + T_hot);
        console.log('T_warm :' + T_warm);

        const H_low = this.heightLow(deltaH);
        const H_med = this.heightMed(deltaH);
        const H_high = this.heightHigh(deltaH);
        console.log('H_low :' + H_low);
        console.log('H_med :' + H_med);
        console.log('H_high :' + H_high);

        const E_low = this.ethLow(ethanol);
        const E_med = this.ethMed(ethanol);
        const E_high = this.ethHigh(ethanol);
        console.log('E_low :' + E_low);
        console.log('E_med :' + E_med);
        console.log('E_high :' + E_high);

        const RR_fall = this.rrFalling(riseRate);
        const RR_stag = this.rrStagnant(riseRate);
        const RR_rise = this.rrRising(riseRate);
        console.log('RR_fall :' + RR_fall);
        console.log('RR_stag :' + RR_stag);
        console.log('RR_rise :' + RR_rise);

        const SC_low = this.scLow(stagnationCounter);
        const SC_med = this.scMed(stagnationCounter);
        const SC_high = this.scHigh(stagnationCounter);
        console.log('SC_low :' + SC_low);
        console.log('SC_med :' + SC_med);
        console.log('SC_high :' + SC_high);

        const PA_no = this.paNo(peakAchieved);
        const PA_yes = this.paYes(peakAchieved);
        console.log('PA_no :' + PA_no);
        console.log('PA_yes :' + PA_yes);

        // 2) rule activations (Mamdani antecedents)
        // A. READY family
        const r_readyUrg = Math.min(T_hot, H_high, E_high, Math.max(RR_rise, PA_yes));      // urgent
        const r_ready = Math.min(T_warm, H_high, E_high, Math.max(RR_rise, PA_yes));     // normal ready
        const r_readyOpt = Math.min(T_cold, H_high, E_high, Math.max(RR_rise, PA_yes));     // usable but optional

        // B. FEED / NOT READY family
        const r_feedFromMed = Math.min(H_med, Math.max(E_med, E_high), Math.max(RR_rise, RR_fall)); // medium rise + ethanol -> feed suggested
        const r_notReadyEarly = Math.min(H_med, Math.max(E_low, E_med), RR_rise); // early-stage rising but ethanol low -> not ready
        const r_feedWeak = Math.min(H_high, Math.max(E_low, E_med)); // high rise but low ethanol -> weak starter => feed again

        // C. FALL / COLLAPSE (after peak)
        const r_fallAfterPeak = Math.min(RR_fall, Math.max(H_high, H_med, H_low), PA_yes);
        const r_postPeak = Math.min(RR_fall, PA_yes, Math.max(H_med, H_high), Math.max(E_med, E_high));

        // D. STAGNATION & DEAD
        const r_dead1 = Math.min(Math.max(RR_stag, RR_fall), E_high, SC_high); // stagnant + high ethanol + many stagnant -> dead
        const r_dead2 = Math.min(Math.max(RR_stag, RR_fall), E_high, PA_no, Math.max(SC_med, SC_high)); // stagnant mid-rise, high ethanol, never peaked -> likely dead

        // E. JUST-FED / NOT_READY
        const r_justFed1 = Math.min(H_low, Math.max(E_low, E_med), RR_stag, SC_low);
        const r_justFed2 = Math.min(H_low, Math.max(E_low, E_med), SC_low, RR_rise);

        console.log('r_ready :' + r_ready);
        console.log('r_readyUrg :' + r_readyUrg);
        console.log('r_readyOpt :' + r_readyOpt);
        console.log('r_feedFromMed :' + r_feedFromMed);
        console.log('r_notReadyEarly :' + r_notReadyEarly);
        console.log('r_feedWeak :' + r_feedWeak);
        console.log('r_fallAfterPeak :' + r_fallAfterPeak);
        console.log('r_postPeak :' + r_postPeak);
        console.log('r_dead1 :' + r_dead1);
        console.log('r_dead2 :' + r_dead2);
        console.log('r_justFed :' + r_justFed1);
        console.log('r_justFed :' + r_justFed2);

        // 3. Mamdani Aggregation + Centroid Defuzzification
        let num = 0, den = 0;
        for (let i = 0; i <= this.OUT_STEPS; i++) {
            const x = i / this.OUT_STEPS;

            // compute clipped membership per rule -> min(rule_strength, outputMF(x))
            const mu_readyUrg = Math.min(r_readyUrg, this.mfReadyUrgent(x));
            const mu_ready = Math.min(r_ready, this.mfReady(x));
            const mu_readyOpt = Math.min(r_readyOpt, this.mfReadyOptional(x));

            const mu_feedFromMed = Math.min(r_feedFromMed, this.mfFeedAgain(x));
            const mu_notReadyEarly = Math.min(r_notReadyEarly, this.mfNotReady(x));
            const mu_feedWeak = Math.min(r_feedWeak, this.mfFeedAgain(x));

            const mu_postPeak = Math.min(r_postPeak, this.mfPostPeak(x));
            const mu_fallAfterPeak = Math.min(r_fallAfterPeak, this.mfFeedAgain(x)); // treat collapse as feed-again
            const mu_dead1 = Math.min(r_dead1, this.mfDead(x));
            const mu_dead2 = Math.min(r_dead2, this.mfDead(x));
            const mu_justFed1 = Math.min(r_justFed1, this.mfFeedAgain(x));
            const mu_justFed2 = Math.min(r_justFed2, this.mfFeedAgain(x));

            // aggregate (max of all clipped mfs)
            const mu = Math.max(
                mu_readyUrg,
                mu_ready,
                mu_readyOpt,
                mu_feedFromMed,
                mu_notReadyEarly,
                mu_feedWeak,
                mu_fallAfterPeak,
                mu_dead1,
                mu_dead2,
                mu_justFed1,
                mu_justFed2,
                mu_postPeak
            );

            num += x * mu;
            den += mu;
        }

        const crisp = den === 0 ? 0 : num / den;

        // 4. Crisp → Category
        let status: FuzzyState;
        if (crisp >= MAP.URGENT) status = "READY_URGENT";
        else if (crisp >= MAP.READY) status = "READY";
        else if (crisp >= MAP.OPTIONAL) status = "READY_OPTIONAL";
        else if (crisp >= MAP.NOTREADY) status = "NOT_READY";
        else if (crisp >= MAP.FEED) status = "FEED_AGAIN";
        else status = "STAGNANT";

        if (r_readyUrg > 0.6) status = 'READY_URGENT';
        else if (r_ready > 0.6) status = 'READY';
        else if (r_readyOpt > 0.6) status = 'READY_OPTIONAL';
        else if (r_postPeak > 0.3) status = 'POST_PEAK';
        else if (r_fallAfterPeak > 0.1 || r_feedWeak > 0.1 || r_feedFromMed > 0.1) status = 'FEED_AGAIN';
        else if (r_dead1 > 0.1 || r_dead2 > 0.1) status = 'STAGNANT';

        let isNotify = false;
        if (status === 'READY' || status === 'READY_OPTIONAL' || status === 'READY_URGENT') {
            isNotify = true;
            P.is_feeding = false;
        }
        return { crisp, status, isNotify };
    }
}
