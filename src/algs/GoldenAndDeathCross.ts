import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover } from '../lib/util/decisions';

export default function(candles: Candles):AlgorithmResult {
    const sma15 = candles.close().sma(15);
    const sma50 = candles.close().sma(50);

    // golden cross
    const goldenCross = new Crossover(sma15, sma50);

    // death cross
    const deathCross = new Crossover(sma50, sma15);

    return {
        entry: goldenCross,
        exit: deathCross,
        state: {
            goldenCross,
            deathCross,
            sma15,
            sma50
        }
    };
}