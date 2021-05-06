/**
 * The currency pair to get data for and/or trade on
 */
export enum CoinbaseProduct {
  BTC_USD = 'BTC-USD',     ETH_USD = 'ETH-USD',     LINK_EUR = 'LINK-EUR',
  BAND_BTC = 'BAND-BTC',   DAI_USDC = 'DAI-USDC',   ZEC_BTC = 'ZEC-BTC',
  ADA_GBP = 'ADA-GBP',     ADA_BTC = 'ADA-BTC',     NU_GBP = 'NU-GBP',
  YFI_USD = 'YFI-USD',     EOS_EUR = 'EOS-EUR',     CRV_USD = 'CRV-USD',
  ALGO_EUR = 'ALGO-EUR',   XTZ_GBP = 'XTZ-GBP',     KNC_BTC = 'KNC-BTC',
  MATIC_EUR = 'MATIC-EUR', BAT_ETH = 'BAT-ETH',     NMR_GBP = 'NMR-GBP',
  ETH_USDC = 'ETH-USDC',   DAI_USD = 'DAI-USD',     GRT_USD = 'GRT-USD',
  NMR_USD = 'NMR-USD',     OMG_USD = 'OMG-USD',     BCH_GBP = 'BCH-GBP',
  CGLD_EUR = 'CGLD-EUR',   MATIC_GBP = 'MATIC-GBP', YFI_BTC = 'YFI-BTC',
  ALGO_GBP = 'ALGO-GBP',   AAVE_GBP = 'AAVE-GBP',   SKL_GBP = 'SKL-GBP',
  ETH_BTC = 'ETH-BTC',     WBTC_USD = 'WBTC-USD',   SKL_EUR = 'SKL-EUR',
  ZRX_EUR = 'ZRX-EUR',     SNX_USD = 'SNX-USD',     SKL_USD = 'SKL-USD',
  ALGO_BTC = 'ALGO-BTC',   GRT_EUR = 'GRT-EUR',     BTC_GBP = 'BTC-GBP',
  MATIC_BTC = 'MATIC-BTC', BNT_GBP = 'BNT-GBP',     AAVE_EUR = 'AAVE-EUR',
  SKL_BTC = 'SKL-BTC',     DASH_BTC = 'DASH-BTC',   ZRX_USD = 'ZRX-USD',
  CRV_GBP = 'CRV-GBP',     EOS_BTC = 'EOS-BTC',     CGLD_USD = 'CGLD-USD',
  FIL_GBP = 'FIL-GBP',     SUSHI_USD = 'SUSHI-USD', BAND_GBP = 'BAND-GBP',
  FIL_BTC = 'FIL-BTC',     LTC_EUR = 'LTC-EUR',     BNT_BTC = 'BNT-BTC',
  XTZ_BTC = 'XTZ-BTC',     CRV_BTC = 'CRV-BTC',     ANKR_USD = 'ANKR-USD',
  ETC_GBP = 'ETC-GBP',     ADA_USD = 'ADA-USD',     OMG_EUR = 'OMG-EUR',
  FIL_EUR = 'FIL-EUR',     BTC_EUR = 'BTC-EUR',     ETC_USD = 'ETC-USD',
  BAL_BTC = 'BAL-BTC',     CVC_USDC = 'CVC-USDC',   ETH_GBP = 'ETH-GBP',
  GRT_GBP = 'GRT-GBP',     REP_USD = 'REP-USD',     NMR_BTC = 'NMR-BTC',
  AAVE_USD = 'AAVE-USD',   SNX_EUR = 'SNX-EUR',     SUSHI_ETH = 'SUSHI-ETH',
  BAND_EUR = 'BAND-EUR',   WBTC_BTC = 'WBTC-BTC',   BCH_USD = 'BCH-USD',
  LINK_BTC = 'LINK-BTC',   ETH_EUR = 'ETH-EUR',     EOS_USD = 'EOS-USD',
  NMR_EUR = 'NMR-EUR',     LRC_USD = 'LRC-USD',     NU_EUR = 'NU-EUR',
  FIL_USD = 'FIL-USD',     COMP_BTC = 'COMP-BTC',   ATOM_BTC = 'ATOM-BTC',
  COMP_USD = 'COMP-USD',   SNX_BTC = 'SNX-BTC',     KNC_USD = 'KNC-USD',
  LINK_USD = 'LINK-USD',   UMA_EUR = 'UMA-EUR',     UMA_USD = 'UMA-USD',
  XTZ_USD = 'XTZ-USD',     BNT_USD = 'BNT-USD',     BAND_USD = 'BAND-USD',
  LINK_GBP = 'LINK-GBP',   AAVE_BTC = 'AAVE-BTC',   MKR_USD = 'MKR-USD',
  SUSHI_BTC = 'SUSHI-BTC', DNT_USDC = 'DNT-USDC',   MKR_BTC = 'MKR-BTC',
  UNI_USD = 'UNI-USD',     MATIC_USD = 'MATIC-USD', BAL_USD = 'BAL-USD',
  BNT_EUR = 'BNT-EUR',     LINK_ETH = 'LINK-ETH',   UNI_BTC = 'UNI-BTC',
  CRV_EUR = 'CRV-EUR',     ANKR_EUR = 'ANKR-EUR',   GRT_BTC = 'GRT-BTC',
  GNT_USDC = 'GNT-USDC',   CGLD_BTC = 'CGLD-BTC',   LTC_BTC = 'LTC-BTC',
  LTC_USD = 'LTC-USD',     CGLD_GBP = 'CGLD-GBP',   ETC_BTC = 'ETC-BTC',
  ATOM_USD = 'ATOM-USD',   STORJ_USD = 'STORJ-USD', OXT_USD = 'OXT-USD',
  XLM_USD = 'XLM-USD',     SNX_GBP = 'SNX-GBP',     ZRX_BTC = 'ZRX-BTC',
  NU_USD = 'NU-USD',       BCH_BTC = 'BCH-BTC',     XLM_BTC = 'XLM-BTC',
  ANKR_GBP = 'ANKR-GBP',   BAT_USDC = 'BAT-USDC',   REN_BTC = 'REN-BTC',
  LTC_GBP = 'LTC-GBP',     UMA_GBP = 'UMA-GBP',     XLM_EUR = 'XLM-EUR',
  ADA_EUR = 'ADA-EUR',     REP_BTC = 'REP-BTC',     LOOM_USDC = 'LOOM-USDC',
  ETC_EUR = 'ETC-EUR',     OMG_GBP = 'OMG-GBP',     SUSHI_EUR = 'SUSHI-EUR',
  MANA_USDC = 'MANA-USDC', DASH_USD = 'DASH-USD',   BTC_USDC = 'BTC-USDC',
  OMG_BTC = 'OMG-BTC',     LRC_BTC = 'LRC-BTC',     ZEC_USD = 'ZEC-USD',
  SUSHI_GBP = 'SUSHI-GBP', ALGO_USD = 'ALGO-USD',   ZEC_USDC = 'ZEC-USDC',
  XTZ_EUR = 'XTZ-EUR',     REN_USD = 'REN-USD',     ETH_DAI = 'ETH-DAI',
  UMA_BTC = 'UMA-BTC',     NU_BTC = 'NU-BTC',       BCH_EUR = 'BCH-EUR',
  STORJ_BTC = 'STORJ-BTC', ANKR_BTC = 'ANKR-BTC',   FORTH_USD = 'FORTH-USD'
}

export enum CoinbaseGranularity {
  MINUTE = 60,
  FIVE_MINUTE = 300,
  FIFTEEN_MINUTE = 900,
  HOUR = 3600,
  SIX_HOUR = 21600,
  DAY = 86400
}

export enum LogLevel {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  SUCCESS = 'success'
}


export const COINBASE_API = 'https://api.pro.coinbase.com';
export const COINBASE_EARLIEST_TIMESTAMP = 1464066000000;
export const COINBASE_TRANSACTION_FEE = .0035;