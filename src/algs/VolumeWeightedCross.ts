import { AlgorithmResult, CoinbaseProCandle, Crossover } from '../lib/lib';

export default function(candles: CoinbaseProCandle):AlgorithmResult {
    const vwma10 = candles.vwma(10);
    const vwma20 = candles.vwma(20);

    // golden cross
    const goldenCross = new Crossover(vwma10, vwma20);

    // death cross
    const deathCross = new Crossover(vwma20, vwma10);

    return {
        entry: goldenCross,
        exit: deathCross,
        state: {
            goldenCross,
            deathCross,
            vwma10,
            vwma20
        }
    };
}