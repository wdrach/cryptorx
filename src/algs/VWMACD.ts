import { AlgorithmResult, Candles, Crossover, safeStop } from '../lib/lib';

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