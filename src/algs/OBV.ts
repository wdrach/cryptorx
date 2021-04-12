import { map } from 'rxjs/operators';
import { AlgorithmResult, Candles } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    const UPPER = 75;
    const LOWER = 20;

    const rsi = candles.rsi();

    // rsi is above upper
    const overbought = rsi.pipe(map((val) => val > UPPER));
  
    // rsi is below lower
    const oversold = rsi.pipe(map((val) => val < LOWER));

    return {
        sell: overbought,
        buy: oversold,
        state: {
            rsi,
            overbought,
            oversold,
        }
    };
}