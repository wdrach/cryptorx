import { AlgorithmResult, CoinbaseProCandle, Crossover } from '../lib/lib';

export default function(candles: CoinbaseProCandle):AlgorithmResult {
    // 10, 20 - DAY : 229.05 234.22, 239.88
    const vwma30 = candles.vwma(10);
    const vwma50 = candles.vwma(20);

    // golden cross
    const goldenCross = new Crossover(vwma30, vwma50);

    // death cross
    const deathCross = new Crossover(vwma50, vwma30);

    return {
        buy: goldenCross,
        sell: deathCross,
        state: {
            goldenCross,
            deathCross,
            vwma30,
            vwma50
        }
    };
}