import { AlgorithmResult, CoinbaseProCandles, Crossover, NegativeCrossover } from '../lib/lib';

export default function(candles: CoinbaseProCandles): AlgorithmResult {
    const typical = candles.typical();
    const upper = candles.volumeWeightedBollingerBand();
    const lower = candles.volumeWeightedBollingerBand(false);

    // price crosses upper, exit signal
    const priceOverUpper = new Crossover(typical, upper);

    // price dips below lower, entry signal
    const priceBelowLower = new NegativeCrossover(typical, lower);

    return {
        exit: priceOverUpper,
        entry: priceBelowLower,
        state: {
            priceOverUpper,
            priceBelowLower,
            upper,
            lower
        }
    };
}