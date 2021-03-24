import { AlgorithmResult, CoinbaseProCandle, Crossover } from '../lib/lib';

export default function(candles: CoinbaseProCandle):AlgorithmResult {
    const sma15 = candles.close().sma(15);
    const sma50 = candles.close().sma(50);

    // golden cross
    const goldenCross = new Crossover(sma15, sma50);

    // death cross
    const deathCross = new Crossover(sma50, sma15);

    return {
        buy: goldenCross,
        sell: deathCross,
        state: {
            goldenCross,
            deathCross,
            sma15,
            sma50
        }
    };
}