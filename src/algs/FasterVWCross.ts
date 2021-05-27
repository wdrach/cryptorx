import { AlgorithmResult, Candles, Crossover } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    const vwma5 = candles.vwma(5 * 24);
    const vwma10 = candles.vwma(10 * 24);

    // golden cross
    const goldenCross = new Crossover(vwma5, vwma10);

    // death cross
    const deathCross = new Crossover(vwma10, vwma5);

    return {
        entry: goldenCross,
        exit: deathCross,
        state: {
            goldenCross,
            deathCross,
            vwma10,
            vwma5
        }
    };
}