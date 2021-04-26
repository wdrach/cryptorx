import { map } from 'rxjs/operators';
import { AlgorithmResult, Candles } from '../lib/lib';

export default function(candles: Candles):AlgorithmResult {
    const UPPER = 90;
    const LOWER = 30;

    const mfi = candles.mfi();

    // rsi is above upper
    const overbought = mfi.pipe(map((val) => val > UPPER));
  
    // rsi is below lower
    const oversold = mfi.pipe(map((val) => val < LOWER));

    return {
        exit: overbought,
        entry: oversold,
        state: {
            mfi,
            overbought,
            oversold,
        }
    };
}