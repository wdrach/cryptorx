import { Observable, Subject, Subscription, zip } from 'rxjs';
import { bufferCount, map, pluck } from 'rxjs/operators';
import { bollingerBand, stddev } from '../util/math';

/** A class for handling number streams with a mathematical boost */
export class Price extends Subject<number> {
  _subscription: Subscription | undefined;

  /**
   * Create a price stream, either to call next on manually or infer from an input stream
   * 
   * @param input if your price stream is coming from somewhere (like a candle stream) you can use input it here.
   * @param key will perform a 'pluck' on the input if provided
   */
  // eslint-disable-next-line
  constructor(input?: Subject<any> | Observable<any>, key?: string) {
    super();

    if (input) {
      const inputObs: Observable<number> | Subject<number> = key ? input.pipe(pluck(key)) : input;

      this._subscription = inputObs.subscribe((val: number) => {
        this.next(val);
      });
    }
  }

  _sma(values: number[]): number {
    return (values.reduce((a, b) => a + b, 0) / values.length);
  }


  /**
   * Take the simple moving average over a given period
   * 
   * @param period the length of time to take the average for, smoothing constant
   */
  sma(period: number): Price {
    const reducer = map((values: number[]) => {
      return this._sma(values);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /** Shorthand for sma(5) */
  sma5(): Price {
    return this.sma(5);
  }

  /** Shorthand for sma(20) */
  sma20(): Price {
    return this.sma(20);
  }

  /** Shorthand for sma(30) */
  sma30(): Price {
    return this.sma(30);
  }

  /** Shorthand for sma(50) */
  sma50(): Price {
    return this.sma(50);
  }

  /** Shorthand for sma(100) */
  sma100(): Price {
    return this.sma(100);
  }

  /** Shorthand for sma(200) */
  sma200(): Price {
    return this.sma(200);
  }

  _ema(currentEma: number, val: number, smoothing: number): number {
    const commonTerm = smoothing;
    return val * commonTerm + currentEma * (1 - commonTerm);
  }

  /**
   * Take the exponential moving average over a given period
   * 
   * @param period the length of time to take the average for
   * @param smoothing the smoothing constant, defaults to 2/(period + 1)
   */
  ema(period: number, smoothing?: number): Price {
    const smoothingConstant = smoothing || 2/(period + 1);

    let currentEma = 0;
    const reducer = map((values: number[]) => {
      const len = values.length;

      // no EMA? Start with an SMA
      if (!currentEma) {
        if (values.length >= (period - 1)) {
          currentEma = this._sma(values);
          return currentEma;
        }

        return this._sma(values);
      } else {
        currentEma = this._ema(currentEma, values[len - 1], smoothingConstant);
        return currentEma;
      }
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /** Shorthand for ema(5) */
  ema5(): Price {
    return this.ema(5);
  }

  /** Shorthand for ema(20) */
  ema20(): Price {
    return this.ema(20);
  }

  /** Shorthand for ema(30) */
  ema30(): Price {
    return this.ema(30);
  }

  /** Shorthand for ema(50) */
  ema50(): Price {
    return this.ema(50);
  }

  /** Shorthand for ema(100) */
  ema100(): Price {
    return this.ema(100);
  }

  /** Shorthand for ema(200) */
  ema200(): Price {
    return this.ema(200);
  }


  /**
   * Create a single, simple moving average based Bollinger Band
   * 
   * @param upper true for an upper band, false for a lower band
   * @param period the length of time to take the moving average for
   * @param deviations the number of standard deviations to offset the band
   */
  bollingerBand(upper = true, period = 20, deviations = 2): Price {
    const reducer = map((values: number[]) => {
      const sma = this._sma(values);
      const sdev = stddev(sma, values);

      return bollingerBand(upper, sma, deviations, sdev);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /**
   * Create a single, exponential moving average based Bollinger Band
   * 
   * @param upper true for an upper band, false for a lower band
   * @param period the length of time to take the moving average for
   * @param deviations the number of standard deviations to offset the band
   * @param smoothing the smoothing constant for the ema, defaults to 2/(period + 1)
   */
  bollingerBandEma(upper = true, period = 20, deviations = 2, smoothing?: number): Price {
    const smoothingConstant = smoothing || 2/(period + 1);

    let currentEma = 0;

    const reducer = map((values: number[]) => {
      let ema = 0;
      const len = values.length;
      // no EMA? Start with an SMA
      if (!currentEma) {
        if (len >= (period - 1)) {
          currentEma = this._sma(values);
          ema = currentEma;
        } else {
          ema = this._sma(values);
        }
      } else {
        currentEma = this._ema(currentEma, values[len - 1], smoothingConstant);
        ema = currentEma;
      }
      const sdev = stddev(ema, values);

      return bollingerBand(upper, ema, deviations, sdev);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /**
   * Returns a custom MACD indicator for 2 given periods.
   * Defined as EMA(lowerPeriod) - EMA(upperPeriod)
   * 
   * @param lowerPeriod the first, smaller period for the ema
   * @param upperPeriod the second, larger period for the ema 
   */
  macdOf(lowerPeriod = 12, upperPeriod = 26): Price {
    return new Price(zip(this.ema(lowerPeriod), this.ema(upperPeriod)).pipe(map(([ema1, ema2]) => ema1 - ema2)));
  }

  /**
   * Returns the MACD indicator, defined as the EMA(12) - EMA(26)
   */
  macd(): Price {
    return this.macdOf();
  }

  /**
   * Returns a custom MACD indicator for 2 given periods.
   * Defined as EMA(MACD(lowerPeriod, upperPeriod), signalPeriod)
   * 
   * @param lowerPeriod the first, smaller period for the ema
   * @param upperPeriod the second, larger period for the ema 
   * @param signalPeriod the period to base the signal value off of
   */
  macdSignalOf(lowerPeriod = 12, upperPeriod = 26, signalPeriod = 9): Price {
    return this.macdOf(lowerPeriod, upperPeriod).ema(signalPeriod);
  }

  /**
   * Returns the MACD signal, defined as EMA(MACD, 9)
   */
  macdSignal(): Price {
    return this.macdSignalOf();
  }

  /**
   * Returns the price rate of change, defined as:
   * 100 * (price(n) - price(n - p)) / price(n - p)
   * 
   * @param period the period to read the rate of change for
   */
  roc(period = 12): Price {
    const reducer = map((values: number[]) => {
      const firstPrice = values[0];
      const lastPrice = values[values.length - 1];

      return 100 * (lastPrice - firstPrice) / firstPrice;
    });

    return new Price(this.pipe(bufferCount(period + 1, 1), reducer));
  }

  /**
   * Uses the numeric value to calculate a stochastic oscillator, rather than the candles
   * Useful for calculating things like the stochastic RSI
   * 
   * @param period the period to read from
   */
  takeStoch(period = 14): Price {
    const reducer = map((values: number[]) => {
      const current = values[values.length - 1];
          
      let min = -1;
      let max = -1;

      for (const val of values) {
        if (min === -1 || val < min) min = val;
        if (max === -1 || val > max) max = val;
      }

      return (current - min)/(max - min);
    });

    return new Price(this.pipe(bufferCount(period, 1), reducer));
  }

  /**
   * Invert the price
   */
  inverse(): Price {
    return new Price(this.pipe(map((val) => 1/val)));
  }


  complete(): void {
    if (this._subscription) {
      this._subscription.unsubscribe();
    }
    super.complete();
  }
}