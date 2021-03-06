# cryptorx
RxJS + Coinbase Pro/Kraken + Technical Analysis Operators

-l runs a live trade
  * You need to have either a .env set with environment variables for
    * COINBASE_API_KEY - your api key
    * COINBASE_SECRET - your api secret (provided to you by Coinbase when creating a key)
    * COINBASE_PASSPHRASE - your api passphrase (provided by you to Coinbase when creating a key)
-s runs a simulation
-p runs a papertrade (a simulation, but with current data instead of historical data)
-f + a filename with NO EXTENSION outputs debug csv files


Hitlist:
 - Weight decisions
 - Real transactions!
 - Tests for indicators

Indicators:
Oscillators:
 - RSI: https://www.investopedia.com/terms/r/rsi.asp
 - Price Rate of Change (ROC): https://www.investopedia.com/terms/p/pricerateofchange.asp
 - Money Flow Index (MFI): https://www.investopedia.com/terms/m/mfi.asp

Candlestick Patterns:
 * Potency reduces drasically 3-5 periods after a pattern is noticed
 - 3 line strike
   - Used on a downtrend, reversal signal
   - 3 downward candles followed by a single upward candle that closes above the first candle's high
   - Predicts higher prices with 83% accuracy
 - 3 black crows
   - Used on an uptrend, reversal signal
   - Starts at or near the high of an uptrend
   - 3 bars in a row that reach new lows and close below the previous bar's low
   - Predicts lower prices with a 78% accuracy
 - Evening star
   - Used on an uptrend, reversal signal
   - Tall upward bar
   - Short bar (low volume)
   - Tall downward bar
   - Predicts lower prices with a 72% accuracy
 - Abandoned baby
   - The opposite of an Evening Star, downtrend reversal signal
   - Tall downward bar
   - Short bar (low volume)
   - Tall upward bar
   - Predicts higher prices with a 50% accuracy

 ## Notes
 Lower Bollinger bands - 1 day candle, 20 day period, 2 stddev - appear to be a pretty good buy indicator
 The upper bands are horrible sell indicators


Stochastic bounds - 80 = overbought, 20 = oversold
 A trader might interpret a sell signal when the Stochastic is above the 80 overbought line and the %K line crosses below the %D line, sell.
 A trader might interpret a buy signal when the Stochastic is below the 20 oversold line and the %K line crosses over the %D line.
 When Stochastics spend a lot of time in overbought or oversold, that's a sign of a strong trend

 The slow stochastic with _no_ overbought or oversold lines looks like a great indicator at first glance.


 Streak indicators:
 https://help.streak.tech/indicators/

 Major Indicators
 Averages:
  - EMA(5), SMA(5), EMA(10), SMA(10), EMA(20), SMA(20), ... (there's 16 indicators but that's all they list)
     - Buy strategy
        - If the short term trend is bullish, then you can use: SMA(20) higher than SMA(40)
     - Sell strategy
        - If the short term trend is bearish, then you can use: SMA(20) lower than SMA(40)
 Oscillators:
  - RSI(14), Stoch.%K (14, 3, 3), CCI (20), ADI (14), Awesome Osc., Momentum (10), ... (there's 10 indicators but that's all they list)

Algs:
https://streak.world/discover
