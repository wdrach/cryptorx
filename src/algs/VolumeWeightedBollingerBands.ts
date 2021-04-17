import { AlgorithmResult, CoinbaseProCandle, Crossover, NegativeCrossover } from '../lib/lib';

export default function(candles: CoinbaseProCandle): AlgorithmResult {
    const typical = candles.typical();
    const upper = candles.volumeWeightedBollingerBand();
    const lower = candles.volumeWeightedBollingerBand(false);

    // price crosses upper, sell signal
    const priceOverUpper = new Crossover(typical, upper);

    // price dips below lower, buy signal
    const priceBelowLower = new NegativeCrossover(typical, lower);

    return {
        sell: priceOverUpper,
        buy: priceBelowLower,
        state: {
            priceOverUpper,
            priceBelowLower,
            upper,
            lower
        }
    };
}