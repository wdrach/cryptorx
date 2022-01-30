import { map } from 'rxjs/operators';
import { AlgorithmResult } from '../lib/streams/alg';
import { jumpCandles } from '../lib/streams/broker';
import { Candles } from '../lib/streams/candles';

export default function(c: Candles):AlgorithmResult {

  const candles = jumpCandles(c);

  const UPPER = 90;
  const LOWER = 10;

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