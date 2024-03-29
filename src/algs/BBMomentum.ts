import { bufferCount, map, withLatestFrom } from 'rxjs/operators';
import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';
import { Crossover, NegativeCrossover } from '../lib/util/decisions';
import { condenseCandles } from '../lib/util/helpers';

export default function(candles: Candles): AlgorithmResult {
  const dayCandles = condenseCandles(candles);
  const close = dayCandles.close();
  const upper = dayCandles.volumeWeightedBollingerBand();
  const mid = dayCandles.vwma();

  const allGreen = dayCandles.pipe(bufferCount(3, 1), map(([a, b, c]) => a.close > a.open && b.close > b.open && c.close > c.open ));

  const priceBelowSma = new NegativeCrossover(close, mid);

  // price crosses upper, entry signal
  const priceAboveUpper = new Crossover(close, upper);
  const bullConfirmation = priceAboveUpper.pipe(withLatestFrom(allGreen), map(([a, b]) => a && b));

  return {
    exit: priceBelowSma,
    entry: bullConfirmation,
    state: {
    }
  };
}
