export type FuzzyState =
    | "FEED_AGAIN"
    | "NOT_READY"
    | "READY_OPTIONAL"
    | "READY"
    | "READY_URGENT"
    | "DEAD";

export interface FuzzyInput {
    tempC: number;            // °C
    deltaH: number;           // mm (current - baseline or delta)
    ethanol: number;          // ADC raw or ppm
    riseRate: number;         // mm since last sample (H[n] - H[n-1])
    stagnationCounter: number;// integer count of consecutive stagnant readings
    peakAchieved: number;     // 0 or 1 (or fractional 0..1)
};

export interface FuzzyOutput {
    crisp: number;            // 0..1 defuzzified value
    status: FuzzyState;
    isNotify: boolean;
}

export interface RawFuzzyInput {
    prev_fil_mean_H?: number;
    prev_fil_mean_E?: number;
    prev_fil_mean_T?: number;
    fil_mean_H: number;
    fil_mean_E: number;
    fil_mean_T: number;
    prev_raw_mean_H?: number;
    prev_raw_mean_E?: number;
    prev_raw_mean_T?: number;
    raw_mean_H: number;
    raw_mean_E: number;
    raw_mean_T: number;
}

export const Q: RawFuzzyInput = {
    fil_mean_E: 0,
    fil_mean_H: 0,
    fil_mean_T: 0,
    prev_fil_mean_E: 0,
    prev_fil_mean_H: 0,
    prev_fil_mean_T: 0,
    prev_raw_mean_E: 0,
    prev_raw_mean_H: 0,
    prev_raw_mean_T: 0,
    raw_mean_E: 0,
    raw_mean_H: 0,
    raw_mean_T: 0,
}

export const Q_def = Q;

export const P = {
    stagnationCounter: 0,
    last_peak_H: 0,
    has_peaked: 0,
    is_delta: false,

    // --- Fuzzy thresholds (inputs) ---
    // Temperature (°C)
    T_low_max: 29.0,
    T_med_min: 29.0,
    T_med_max: 33.0,
    T_high_min: 33.0,

    // Delta height (mm)
    H_low_max: 190.0,
    H_med_min: 190.0,
    H_med_max: 180.0,
    H_high_min: 180.0,

    // Ethanol (assume scaled 0..4095 OR ppm), thresholds chosen as raw ADC-ish
    E_low_max: 2000.0,
    E_med_min: 2000.0,
    E_med_max: 3000.0,
    E_high_min: 3000.0,

    // RiseRate thresholds (mm)
    RR_fall: -0.5,
    RR_rise: 0.5,
    RR_dead_margin: 0.2, // small window around 0 considered stagnant

    // StagnationCounter thresholds
    SC_low: 1,    // 0..1 low
    SC_med: 3,    // ~2..3 medium
    SC_high: 5,   // >=5 high stagnation

    overflowHeightThreshold: 90,
    ethanolSaturateValue: 4095, // raw ADC saturation
    ethanolSaturateNeeded: 3, // count threshold

    // For rise/fall detection (compare last delta to current)
    riseEpsilon: 0.5,  // mm difference to consider change
    fallEpsilon: -0.5,
    // Small meaningful rise
    minMeaningfulDelta: 0.2,  // mm
}

export const MAP = {
    URGENT: 0.85,
    READY: 0.70,
    OPTIONAL: 0.55,
    NOTREADY: 0.30,
    FEED: 0.15,
};