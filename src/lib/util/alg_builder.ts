import { Algorithm } from '../streams/alg';
import { Candles } from '../streams/candles';
import { Price } from '../streams/price';
import { Crossover, Decision, GreaterThan, LessThan, NegativeCrossover } from './decisions';

export enum SourceActions {
  CANDLES = 'candles',
  STREAM  = 'stream'
}

export enum DecisionActions {
  CROSSOVER = 'crossover',
  NEGCROSSOVER = 'negativecrossover',
  GT  = 'greaterthan',
  LT  = 'lessthan',
  OR  = 'or',
  AND = 'and',
}

export enum CandleActions {
  OPEN    = 'open',
  CLOSE   = 'close',
  HIGH    = 'high',
  LOW     = 'low',
  TYPICAL = 'typical',
  GAIN    = 'gain',
  VOLUME  = 'vol',

  STOCH   = 'stoch',
  STOCHD  = 'stochd',

  STOCHSLOW  = 'stochslow',
  STOCHSLOWD = 'stochslowd',

  RSI  = 'rsi',
  SRSI = 'smoothedrsi',
  OBV  = 'obv',
  VWMA = 'vwma',
  VWBB = 'vwbb',
  MFI  = 'mfi',

  STOCHRSI = 'stochrsi',

  VWMACDOF    = 'vwmacdof',
  VWMACD      = 'vwmacd',
  VWMACDSIGOF = 'vwmacdsigof',
  VWMACDSIG   = 'vwmacdsig',
}

export enum PriceActions {
  SMA = 'sma',
  EMA = 'ema',
  BBAND = 'bband',
  BBANDEMA = 'bbandema',
  MACDOF = 'macdof',
  MACD = 'macd',
  MACDSIGOF = 'macdsigof',
  MACDSIG = 'macdsig',
  ROC = 'roc',
  TSTOCH = 'takestoch',
  INVERSE = 'inverse',
}

export interface MachineAlgResult {
  entry: number;
  exit: number;
}

/**
 * An algorithm, usually generated by an automated process, with a machine-understandable format:
 */
export interface MachineAlgorithm {
  /**
   * streams are in the following format:
   * [
   *   [
   *     [<action name>, <argument 1>, <argument 2> ....],
   *     ...<actions>
   *   ],
   *   ...<the streams representations>
   * ]
   */
  streams: (SourceActions | CandleActions | DecisionActions | PriceActions | number)[][][];

  /**
   * The alg result is simply:
   * {
   *  entry: <stream index>,
   *  exit: <stream index>,
   *  ... and so on
   * }
   */
  algResult: MachineAlgResult;
}

export const algBuilder = (algToProcess: MachineAlgorithm):Algorithm => {
  return (c: Candles) => {

    const processedStreams:(Candles | Price | Decision<any>)[] = [];

    for (const value of algToProcess.streams) {
      const s = value.slice();
      let str: Candles | Price | Decision<any> = s[0][0] === SourceActions.CANDLES ? c : processedStreams[s[0][1] as number];

      s.shift();

      for (const action of s) {
        if (str.type === 'price') {
          const stream = str as Price;
          switch (action[0]) {
          // Decisions
          case DecisionActions.CROSSOVER:
            str = new Crossover(stream, processedStreams[action[1] as number] as Price);
            break;
          case DecisionActions.NEGCROSSOVER:
            str = new NegativeCrossover(stream, processedStreams[action[1] as number] as Price);
            break;
          case DecisionActions.OR:
            str = new Crossover(stream, processedStreams[action[1] as number] as Price);
            break;
          case DecisionActions.AND:
            str = new NegativeCrossover(stream, processedStreams[action[1] as number] as Price);
            break;
          case DecisionActions.GT:
            str = new GreaterThan(stream, action[1] as number);
            break;
          case DecisionActions.LT:
            str = new LessThan(stream, action[1] as number);
            break;
          
          // Actual price actions
          case PriceActions.SMA:
            str = stream.sma(action[1] as number);
            break;
          case PriceActions.EMA:
            str = stream.ema(action[1] as number);
            break;
          case PriceActions.BBAND:
            str = stream.bollingerBand(!!action[1], action[2] as number, action[3] as number);
            break;
          case PriceActions.BBANDEMA:
            str = stream.bollingerBandEma(!!action[1], action[2] as number, action[3] as number, action[4] as number);
            break;
          case PriceActions.MACDOF:
            str = stream.macdOf(action[1] as number, action[2] as number);
            break;
          case PriceActions.MACD:
            str = stream.macd();
            break;
          case PriceActions.MACDSIGOF:
            str = stream.macdSignalOf(action[1] as number, action[2] as number, action[3] as number);
            break;
          case PriceActions.MACDSIG:
            str = stream.macdSignal();
            break;
          case PriceActions.ROC:
            str = stream.roc(action[1] as number);
            break;
          case PriceActions.TSTOCH:
            str = stream.takeStoch(action[1] as number);
            break;
          case PriceActions.INVERSE:
            str = stream.inverse();
            break;
          }
        } else {
          const stream = str as Candles;
          switch (action[0]) {
          case CandleActions.OPEN:
            str = stream.open();
            break;
          case CandleActions.CLOSE:
            str = stream.close();
            break;
          case CandleActions.HIGH:
            str = stream.high();
            break;
          case CandleActions.LOW:
            str = stream.low();
            break;
          case CandleActions.TYPICAL:
            str = stream.typical();
            break;
          case CandleActions.GAIN:
            str = stream.gain();
            break;
          case CandleActions.VOLUME:
            str = stream.volume();
            break;
          case CandleActions.STOCH:
            str = stream.stoch(action[1] as number);
            break;
          case CandleActions.STOCHD:
            str = stream.stochD(action[1] as number);
            break;
          case CandleActions.STOCHSLOW:
            str = stream.stochSlow(action[1] as number, action[2] as number);
            break;
          case CandleActions.STOCHSLOWD:
            str = stream.stochSlowD(action[1] as number, action[2] as number, action[3] as number);
            break;
          case CandleActions.RSI:
            str = stream.rsi(action[1] as number);
            break;
          case CandleActions.SRSI:
            str = stream.smoothedRsi(action[1] as number);
            break;
          case CandleActions.VWMA:
            str = stream.vwma(action[1] as number);
            break;
          case CandleActions.VWBB:
            str = stream.volumeWeightedBollingerBand(!!action[1], action[2] as number, action[3] as number);
            break;
          case CandleActions.MFI:
            str = stream.mfi(action[1] as number);
            break;
          case CandleActions.STOCHRSI:
            str = stream.stochRsi(action[1] as number);
            break;
          case CandleActions.VWMACDOF:
            str = stream.volumeWeightedMacdOf(action[1] as number, action[2] as number);
            break;
          case CandleActions.VWMACD:
            str = stream.volumeWeightedMacd();
            break;
          case CandleActions.VWMACDSIGOF:
            str = stream.volumeWeightedMacdSignalOf(action[1] as number, action[2] as number, action[3] as number);
            break;
          case CandleActions.VWMACDSIG:
            str = stream.volumeWeightedMacdSignal();
            break;
          }
        }
      }

      processedStreams.push(str);
    }

    return {
      entry: processedStreams[algToProcess.algResult.entry] as Decision<any>,
      exit: processedStreams[algToProcess.algResult.exit] as Decision<any>
    };
  };
};