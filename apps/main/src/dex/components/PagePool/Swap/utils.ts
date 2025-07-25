import lodash from 'lodash'
import type { ExchangeOutput, FormStatus, FormValues } from '@/dex/components/PagePool/Swap/types'
import type { EstimatedGas as FormEstGas } from '@/dex/components/PagePool/types'
import { Token, TokensMapper, PoolDataCacheOrApi } from '@/dex/types/main.types'

export const DEFAULT_EST_GAS: FormEstGas = {
  estimatedGas: 0,
  loading: false,
}

export const DEFAULT_FORM_STATUS: FormStatus = {
  isApproved: false,
  formProcessing: false,
  formTypeCompleted: '',
  step: '',
  error: '',
  warning: '',
}

export const DEFAULT_EXCHANGE_OUTPUT: ExchangeOutput = {
  loading: false,
  exchangeRates: [],
  isExchangeRateLow: false,
  priceImpact: 0,
  toAmount: '',
  modal: null,
}

export const DEFAULT_FORM_VALUES: FormValues = {
  isFrom: null,
  isWrapped: false,
  fromAddress: '',
  fromToken: '',
  fromAmount: '',
  fromError: '',
  toAddress: '',
  toAmount: '',
  toError: '',
  toToken: '',
}

export function getSwapTokens(tokensMapper: TokensMapper, poolDataCacheOrApi: PoolDataCacheOrApi) {
  const { tokenAddresses, tokensCountBy } = poolDataCacheOrApi
  const swapTokensMapper: { [tokenAddress: string]: Token } = {}

  for (const idx in tokenAddresses) {
    const address = tokenAddresses[idx]
    const token = lodash.cloneDeep(tokensMapper[address])

    if (token) {
      swapTokensMapper[address] = {
        ...token,
        haveSameTokenName: tokensCountBy[token.symbol] > 1,
      }
    }
  }

  return {
    selectList: lodash.sortBy(swapTokensMapper, (t) => t.symbol),
    swapTokensMapper,
  }
}
