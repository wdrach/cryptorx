import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover, NegativeCrossover } from '../lib/util/decisions';

export default function(candles: Candles): AlgorithmResult {
  const typical = candles.typical();
  const upper = typical.bollingerBand();
  const lower = typical.bollingerBand(false);

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
