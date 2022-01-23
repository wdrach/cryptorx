import { Observable, Subject, zip } from 'rxjs';
import { bufferCount, map, pluck, scan, takeUntil } from 'rxjs/operators';
import { bollingerBand, stddev } from '../util/math';
import { Price } from './price';

/** A convenience class for working with candle data */
export class Candle {
  /** The time (in seconds since epoch) extracted from the candle object */
  time: number;

  low: number;
  high: number;
  open: number;
  close: number;
  volume: number;

  /**
   * Turn a tlhocv array (from the Coinbase Pro API, for example) into an object-like candle
   * 
   * @param tlhocv an array of data in the form [ time, low, high, open, close, volume ]
   */
  constructor(tlhocv: Array<number>) {
      this.time = tlhocv[0];
      this.low = tlhocv[1];
      this.high = tlhocv[2];
      this.open = tlhocv[3];
      this.close = tlhocv[4];
      this.volume = tlhocv[5];
  }
}

export class Candles extends Subject<Candle> {
    time(): Observable<number> {
        return this.pipe(pluck('time'));
    }

    open(): Price {
        return new Price(this.pipe(pluck('open')));
    }

    close(): Price {
        return new Price(this.pipe(pluck('close')));
    }

    high(): Price {
        return new Price(this.pipe(pluck('high')));
    }

    low(): Price {
        return new Price(this.pipe(pluck('low')));
    }

    typical(): Price {
        return new Price(this.pipe(map((c: Candle) => (c.high + c.low + c.close)/3)));
    }

    gain(): Price {
        return new Price(this.pipe(map((c: Candle) => (c.close - c.open)/c.open)));
    }

    volume(): Price {
        return new Price(this.pipe(pluck('volume')));
    }

    /**
   * The stochastic %K, defined as:
   *  100 * (C - L(P))/(H(P) - L(P))
   * 
   * Where L(P) is the low price in the last P periods
   * and H(P) is the high price in the last P periods
   * 
   * @param period the period to compare to, default of 14
   */
    stoch(period = 14): Price {
        const reducer = map((values: Candle[]) => {
            const lowest = values.reduce((acc, val) => (val.low < acc || acc === -1) ? val.low : acc, -1);
            const highest = values.reduce((acc, val) => val.high > acc ? val.high : acc, -1);
            const lastValue = values[values.length - 1];

            return 100 * (lastValue.close - lowest) / (highest - lowest);
        });

        return new Price(this.pipe(bufferCount(period, 1), reducer));
    }

    /**
   * The stochastic %D, the <avgPeriod> period average of the stochastic %K
   * 
   * @param period the period to compare to, default of 14
   * @param avgPeriod the smoothing factor, default of 3
   */
    stochD(period = 14, avgPeriod = 3): Price {
        return this.stoch(period).ema(avgPeriod);
    }

    /**
   * The stochastic slow %K, defined as the stochastic fast %D
   * 
   * @param period the period to compare to, default of 14
   * @param avgPeriod the smoothing factor, default of 3
   */
    stochSlow(period = 14, avgPeriod = 3): Price {
        return this.stochD(period, avgPeriod);
    }

    /**
   * The stochastic slow %D, applies a second moving average to the stochastic slow %D
   * 
   * @param period the period to compare to, default of 14
   * @param avgPeriod the smoothing factor, default of 3
   * @param secondAvgPeriod the smoothing factor, default of 3
   */
    stochSlowD(period = 14, avgPeriod = 3, secondAvgPeriod = 3): Price {
        return this.stochSlow(period, avgPeriod).ema(secondAvgPeriod);
    }

    /**
     * The Relative Strength Index (RSI) is defined as:
     * RSI = 100 – 100 / (1 + RS)
     * RS = Average Gain of n days UP  / Average Loss of n days DOWN
     * 
     * @param period the period to compare against
     */
    rsi(period = 14): Price {
        const reducer = map((values: Candle[]) => {
            let upCount = 0;
            let upGain = 0;
            let downCount = 0;
            let downGain = 0;

            for (const value of values) {
                if (value.open > value.close) {
                    downCount++;
                    downGain -= (value.close - value.open) / value.open;
                } else {
                    upCount++;
                    upGain += (value.close - value.open) / value.open;
                }
            }

            const rs = (upGain / upCount) / (downGain / downCount);

            return 100 - (100 / (1 + rs));
        });

        return new Price(this.pipe(bufferCount(period, 1), reducer));
    }

    /**
     * The smoothed RSI is a slightly smoothed version of the RSI which uses
     * the previous values to weight the current value, much like an EMA does
     * compared to an SMA.
     * 
     * @param period the period to compare against
     */
    smoothedRsi(period = 14): Price {
        let previousAverageGain = 0;
        let previousAverageLoss = 0;
        const reducer = map((values: Candle[]) => {
            if (!previousAverageGain) {
                let upCount = 0;
                let upGain = 0;
                let downCount = 0;
                let downGain = 0;

                for (const value of values) {
                    if (value.open > value.close) {
                        downCount++;
                        downGain += (value.close - value.open) / value.open;
                    } else {
                        upCount++;
                        upGain += (value.close - value.open) / value.open;
                    }
                }

                previousAverageGain = upGain / upCount;
                previousAverageLoss = downGain / downCount;

                const rs = (previousAverageGain) / (previousAverageLoss);

                return 100 - 100 / (1 + rs);
            } else {
                const val = values[values.length - 1];
                if (val.open > val.close) {
                    previousAverageGain = (previousAverageGain * (period - 1)) / period;
                    previousAverageLoss = ((previousAverageLoss * (period - 1)) + ((val.close - val.open) / val.open))/period;
                } else {
                    previousAverageLoss = (previousAverageLoss * (period - 1)) / period;
                    previousAverageGain = ((previousAverageGain * (period - 1)) + ((val.close - val.open) / val.open))/period;
                }

                const rs = (previousAverageGain) / (previousAverageLoss);

                return 100 - 100 / (1 + rs);
            }
        });

        return new Price(this.pipe(bufferCount(period, 1), reducer));
    }

    /**
     * Returns the on balance volume stream, defined as:
     * 
     * OBV(n - 1) + {vol if close > open, - vol if close < open, 0 else}
     */
    obv(): Price {
        const scanner = scan((acc: number, val: Candle) => {
            if (val.close > val.open) {
                return acc + val.volume;
            } else if (val.close < val.open) {
                return acc - val.volume;
            }
            return acc;
        }, 0);

        return new Price(this.pipe(scanner));
    }

    _vwma(values: Candle[]): number {
        let volumeWeightedPrice = 0;
        let totalVolume = 0;

        for (const val of values) {
            if (!val) continue;
            const typical = (val.high + val.low + val.close)/3;
            const vol = val.volume;

            volumeWeightedPrice += typical * vol;
            totalVolume += vol;
        }

        return volumeWeightedPrice/totalVolume;
    }

    /**
     * The vwma or volume weighted moving average is a moving average
     * that weighs based on the trade volume in a given period to provide
     * a more dynamic view of price action.
     * 
     * @param period the period to take the average across
     */
    vwma(period = 14): Price {
        const reducer = map(this._vwma);
        return new Price(this.pipe(bufferCount(period, 1), reducer));
    }

    /**
     * Create a single, volume weighted moving average based Bollinger Band
     * 
     * @param upper true for an upper band, false for a lower band
     * @param period the length of time to take the moving average for
     * @param deviations the number of standard deviations to offset the band
     */
    volumeWeightedBollingerBand(upper = true, period = 20, deviations = 2): Price {
        const reducer = map((values: Candle[]) => {
            const sma = this._vwma(values);
            const sdev = stddev(sma, values.map((val) => (val.high + val.low + val.close)/3));

            return bollingerBand(upper, sma, deviations, sdev);
        });

        return new Price(this.pipe(bufferCount(period, 1), reducer));
    }

    /**
     * Returns a custom volume weighted MACD indicator for 2 given periods.
     * Defined as VWMA(lowerPeriod) - VWMA(upperPeriod)
     * 
     * @param lowerPeriod the first, smaller period for the vwma
     * @param upperPeriod the second, larger period for the vwma 
     */
    volumeWeightedMacdOf(lowerPeriod = 12, upperPeriod = 26): Price {
        return new Price(zip(this.vwma(lowerPeriod), this.vwma(upperPeriod)).pipe(map(([vwma1, vwma2]) => vwma1 - vwma2)));
    }

    /**
     * Returns the volume weighted MACD indicator, defined as the VWMA(12) - VWMA(26)
     */
    volumeWeightedMacd(): Price {
        return this.volumeWeightedMacdOf();
    }

    /**
     * Returns a custom VWMACD indicator for 2 given periods.
     * Defined as EMA(VWMACD(lowerPeriod, upperPeriod), signalPeriod)
     * 
     * @param lowerPeriod the first, smaller period for the ema
     * @param upperPeriod the second, larger period for the ema 
     * @param signalPeriod the period to base the signal value off of
     */
    volumeWeightedMacdSignalOf(lowerPeriod = 12, upperPeriod = 26, signalPeriod = 9): Price {
        return this.volumeWeightedMacdOf(lowerPeriod, upperPeriod).ema(signalPeriod);
    }

    /**
     * Returns the VWMACD signal, defined as EMA(VWMACD, 9)
     */
    volumeWeightedMacdSignal(): Price {
        return this.volumeWeightedMacdSignalOf();
    }

    /**
     * Returns the Money Flow Index, defined as
     * 
     * 100 - 100 / (1 + MFR)
     * 
     * Where MFR is:
     * <period> period positive money flow / <period> period negative money flow
     * 
     * @param period the period to take the money flow index on
     */
    mfi(period = 14): Price {
        const reducer = map((values: Candle[]) => {
            let positiveFlow = 0;
            let negativeFlow = 0;

            const last = values.shift() as Candle;
            let lastTypical = (last.close + last.high + last.low)/3;
            for (const val of values) {
                const typical = (val.close + val.high + val.low)/3;
                const rawMoneyFlow = typical * val.volume;
                if (typical > lastTypical) {
                    positiveFlow += rawMoneyFlow;
                } else {
                    negativeFlow += rawMoneyFlow;
                }
                lastTypical = typical;
            }

            if (!positiveFlow) positiveFlow = 1;
            if (!negativeFlow) negativeFlow = 1;

            const mfr = positiveFlow / negativeFlow;
            const mfi = 100 - (100 / (1 + mfr));
            return mfi;
        });

        return new Price(this.pipe(bufferCount(period + 1, 1), reducer));
    }

    /**
     * Returns the stochastic rsi oscillator, defined as
     * 
     * RSI - min(RSI) / (max(RSI) - min(RSI))
     * 
     * @param period the period to take the rsi and stoch against
     */
    stochRsi(period = 14): Price {
        return this.rsi(period).takeStoch(period);
    }
}

export class MappedCandles extends Candles {
    unsubscriber = new Subject<void>();
    constructor(source: Observable<Candle>) {
        super();

        source.pipe(takeUntil(this.unsubscriber)).subscribe((c) => this.next(c));
    }

    unsubscribe(): void {
        this.unsubscriber.next();
        this.unsubscriber.complete();
        super.unsubscribe();
    }
}