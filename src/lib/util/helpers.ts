import { Observable } from 'rxjs';
import { bufferCount, filter, map, skipWhile, withLatestFrom } from 'rxjs/operators';
import { CoinbaseGranularity } from '../constants';
import { Candle, Candles, MappedCandles } from '../streams/candles';

export function safeStop(entry: Observable<boolean>, candles: Candles): Observable<number> {
  return entry.pipe(withLatestFrom(candles), bufferCount(2, 1), map(([prev, curr]) => {
    const [prevVal, prevCandle] = prev;
    const [currVal] = curr;
    if (!prevVal && currVal) {
      return prevCandle.low;
    }

    return 0;
  }), filter((val) => !!val));
}

export function maxStop(entry: Observable<boolean>, candles: Candles, stop = 30): Observable<number> {
  return entry.pipe(withLatestFrom(candles), map(([val, candle]) => {
    if (val) {
      return candle.open * (100 - stop) / 100;
    }

    return 0;
  }), filter((val) => !!val));
}

export function condenseCandles(c: Candles): Candles {
  const ratio = CoinbaseGranularity.DAY / CoinbaseGranularity.HOUR;

  const candleMap = c.pipe(skipWhile((c) => {
    const time = c.time;
    const timeSinceMidnight = time % (24 * 60 * 60);
    // 1 hour before the close of the day
    const timeToSkipTo = CoinbaseGranularity.DAY - CoinbaseGranularity.HOUR;
    const returnVal = timeSinceMidnight !== timeToSkipTo;

    return returnVal;
  }), bufferCount(ratio, ratio), map((values) => {
    // tlhocv: Array<number>
    const tlhocv = [
      values[0].time,
      Math.min(...values.map((val) => val.low)),
      Math.max(...values.map((val) => val.high)),
      values[0].open,
      values[values.length - 1].close,
      values.reduce((tv, v) => tv + v.volume, 0)
    ];
    return new Candle(tlhocv);
  }));

  const candles = new MappedCandles(candleMap);
  return candles;
}

export function jumpCandles(c: Candles): Candles {
  const ratio = CoinbaseGranularity.DAY / CoinbaseGranularity.HOUR;

  const candleMap = c.pipe(skipWhile((c) => {
    const time = c.time;
    const timeSinceMidnight = time % (24 * 60 * 60);
    // 2 hours before the close of the day
    const timeToSkipTo = CoinbaseGranularity.DAY - (2*CoinbaseGranularity.HOUR);
    const returnVal = timeSinceMidnight !== timeToSkipTo;

    return returnVal;
  }), bufferCount(ratio, ratio), map((values) => {
    return values[values.length - 1];
  }));

  const candles = new MappedCandles(candleMap);
  return candles;
}