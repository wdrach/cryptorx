import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover } from '../lib/util/decisions';

export default function(candles: Candles):AlgorithmResult {
    const vwma10 = candles.vwma(10 * 24);
    const vwma20 = candles.vwma(20 * 24);

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