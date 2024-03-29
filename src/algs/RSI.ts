import { map } from 'rxjs/operators';
import { AlgorithmResult } from '../lib/streams/alg';
import { Candles } from '../lib/streams/candles';

export default function(candles: Candles):AlgorithmResult {
  const UPPER = 75;
  const LOWER = 20;

  const rsi = candles.rsi();

  // rsi is above upper
  const overbought = rsi.pipe(map((val) => val > UPPER));
  
  // rsi is below lower
  const oversold = rsi.pipe(map((val) => val < LOWER));

  return {
    exit: overbought,
    entry: oversold,
    state: {
      rsi,
      overbought,
      oversold,
    }
  };
}