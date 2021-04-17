import { AlgorithmResult, Candles, Crossover } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    const typical = candles.typical();
    const macd = typical.macd();
    const signal = typical.macdSignal();

    // macd crosses over signal
    const bull = new Crossover(macd, signal);

    // signal crosses over macd
    const bear = new Crossover(signal, macd);

    return {
        exit: bull,
        entry: bear,
        state: {
            bull,
            bear,
            macd,
            signal
        }
    };
}