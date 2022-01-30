import { bufferCount, map, withLatestFrom } from 'rxjs/operators';
import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';

export default function(candles: Candles):AlgorithmResult {
  const vwma = candles.vwma(10);
  const macd = vwma.macdOf(10, 20);
  const signal = vwma.macdSignalOf(10, 20, 10);

  const diff = macd.pipe(withLatestFrom(signal), map(([m, s]) => m - s));

  const bear = diff.pipe(bufferCount(2, 1), map(([prev, curr]) => curr < prev && curr > 0));
  const bull = diff.pipe(bufferCount(2, 1), map(([prev, curr]) => curr > prev && curr < 0));

  return {
    exit: bear,
    entry: bull,
    state: {
      bull,
      bear,
      diff,
      vwma,
      macd,
      signal
    }
  };
}