import { algBuilder, CandleActions, DecisionActions, SourceActions } from '../lib/util/alg_builder';

export default algBuilder({
  streams: [
    [[SourceActions.CANDLES], [CandleActions.VWMA, 5]], // vwma[5]
    [[SourceActions.CANDLES], [CandleActions.VWMA, 20]], // vwma[20]
    [[SourceActions.STREAM, 0], [DecisionActions.CROSSOVER, 1]], // golden cross
    [[SourceActions.STREAM, 1], [DecisionActions.CROSSOVER, 0]], // death cross
  ],
  algResult: {
    entry: 2, // golden cross
    exit: 3,  // death cross
  }
});