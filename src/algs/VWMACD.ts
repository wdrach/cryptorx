import { AlgorithmResult, Candles, Crossover } from '../lib/lib';

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
        state: {
            bull,
            bear,
            macd,
            signal
        }
    };
}