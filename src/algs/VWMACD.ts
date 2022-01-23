import { AlgorithmResult } from '../lib/streams/alg';
import { safeStop } from '../lib/streams/broker';
import { Candles } from '../lib/streams/candles';
import { Crossover } from '../lib/util/decisions';

export default function(candles: Candles):AlgorithmResult {
    const macd = candles.volumeWeightedMacd();
    const signal = candles.volumeWeightedMacdSignal();

    // macd crosses over signal
    const bull = new Crossover(macd, signal);

    // signal crosses over macd
    const bear = new Crossover(signal, macd);

    return {
        exit: bear,
        entry: bull,
        exitStop: safeStop(bull, candles),
        state: {
            bull,
            bear,
            macd,
            signal
        }
    };
}