/**
 * Konfigurasi Hardware
 */
const VOLTAGE_SOURCE = 5.0;     // Vs dari Step-up
const ADC_REF = 3.3;            // Voltase referensi ESP32
const ADC_RESOLUTION = 4095;    // 12-bit ADC
const RL_RESISTOR = 10.0;       // Resistor beban 10k Ohm (dalam kOhm)
const CLEAN_AIR_RATIO = 60.0;   // Rasio Rs/Ro di udara bersih (dari datasheet MQ3)

interface SensorData {
    rawAdc: number;
    roValue?: number;
}

/**
 * Class untuk memproses sensor MQ3
 */
export class MQ3Processor {
    /**
     * Mengonversi nilai Raw ADC (0-4095) menjadi Tegangan Output (Vout)
     */
    private static adcToVoltage(rawAdc: number): number {
        return (rawAdc / ADC_RESOLUTION) * ADC_REF;
    }

    /**
     * Menghitung Rs (Resistansi Sensor saat ini)
     * Rumus: Rs = RL * (Vs - Vout) / Vout
     */
    public static calculateRs(rawAdc: number): number {
        const vOut = this.adcToVoltage(rawAdc);
        if (vOut === 0) return 0; // Menghindari pembagian dengan nol

        const rs = RL_RESISTOR * (VOLTAGE_SOURCE - vOut) / vOut;
        return rs;
    }

    /**
     * Kalibrasi: Menghitung Ro (Resistansi di udara bersih)
     * Dilakukan saat sensor berada di udara bersih (Clean Air)
     * Nilai Ro ini nantinya disimpan sebagai konstanta.
     */
    public static calculateRo(rawAdcAir: number): number {
        const rsAir = this.calculateRs(rawAdcAir);
        const ro = rsAir / CLEAN_AIR_RATIO;
        return ro;
    }

    /**
     * Mendapatkan Rasio Rs/Ro untuk digunakan pada tabel Fuzzy atau kurva kadar alkohol
     */
    public static getRatio(rawAdc: number, ro: number): number {
        const rs = this.calculateRs(rawAdc);
        if (ro === 0) return 0;
        return rs / ro;
    }
}

// --- CONTOH PENGGUNAAN PADA LOGIKA ANDA ---

const input = {
    ethanol: 1200, // Nilai raw dari ESP32
    // ... variabel lainnya
};

// // 1. Jika Anda ingin melakukan kalibrasi (Mendapatkan Ro)
// const roCalibrated = MQ3Processor.calculateRo(input.ethanol);
// console.log(`Nilai Ro hasil kalibrasi: ${roCalibrated.toFixed(2)} kOhm`);

// // 2. Jika Anda ingin mendapatkan nilai Rs saat ini untuk input Fuzzy
// const currentRs = MQ3Processor.calculateRs(input.ethanol);
// console.log(`Nilai Rs saat ini: ${currentRs.toFixed(2)} kOhm`);

// // 3. Jika Anda sudah punya Ro tetap (misal 0.70) dan ingin mencari rasio
// const fixedRo = 0.69;
// const ratio = MQ3Processor.getRatio(input.ethanol, fixedRo);
// console.log(`Rasio Rs/Ro: ${ratio.toFixed(2)}`);