import lodash from 'lodash'
import type { GetState, SetState } from 'zustand'
import { FormWarning } from '@/lend/components/AlertFormWarning'
import type { FormStatus } from '@/lend/components/PageLoanManage/LoanSelfLiquidation/types'
import type { FormEstGas } from '@/lend/components/PageLoanManage/types'
import { DEFAULT_FORM_EST_GAS, DEFAULT_FORM_STATUS as FORM_STATUS } from '@/lend/components/PageLoanManage/utils'
import apiLending from '@/lend/lib/apiLending'
import type { State } from '@/lend/store/useStore'
import { Api, FutureRates, OneWayMarketTemplate } from '@/lend/types/lend.types'
import { setMissingProvider, useWallet } from '@ui-kit/features/connect-wallet'
import { isGreaterThanOrEqualTo } from '@ui-kit/utils'

type StateKey = keyof typeof DEFAULT_STATE

type SliceState = {
  formEstGas: FormEstGas
  formStatus: FormStatus
  futureRates: FutureRates | null
  liquidationAmt: string
}

const sliceKey = 'loanSelfLiquidation'

// prettier-ignore
export type LoanSelfLiquidationSlice = {
  [sliceKey]: SliceState & {
    fetchDetails(api: Api, market: OneWayMarketTemplate, maxSlippage: string): Promise<void>
    fetchEstGasApproval(api: Api, market: OneWayMarketTemplate, maxSlippage: string): Promise<void>

    // step
    fetchStepApprove(api: Api, market: OneWayMarketTemplate, maxSlippage: string): Promise<{ hashes: string[]; error: string } | undefined>
    fetchStepLiquidate(api: Api, market: OneWayMarketTemplate, liquidationAmt: string, maxSlippage: string): Promise<{ error: string; hash: string; loanExists: boolean } | undefined>

    // steps helper
    setStateByActiveKey<T>(key: StateKey, activeKey: string, value: T): void
    setStateByKey<T>(key: StateKey, value: T): void
    setStateByKeys(SliceState: Partial<SliceState>): void
    resetState(): void
  }
}

export const DEFAULT_FORM_STATUS: FormStatus = {
  ...FORM_STATUS,
  loading: true,
  step: '',
  warning: '',
}

const DEFAULT_STATE: SliceState = {
  formEstGas: DEFAULT_FORM_EST_GAS,
  formStatus: DEFAULT_FORM_STATUS,
  futureRates: null,
  liquidationAmt: '',
}

const { loanSelfLiquidation } = apiLending

const createLoanSelfLiquidationSlice = (set: SetState<State>, get: GetState<State>): LoanSelfLiquidationSlice => ({
  [sliceKey]: {
    ...DEFAULT_STATE,

    fetchDetails: async (api, market, maxSlippage) => {
      const { user } = get()
      const { formStatus, ...sliceState } = get()[sliceKey]
      const { signerAddress } = api

      if (!signerAddress || !api || !market || !maxSlippage) return

      // loading
      sliceState.setStateByKey('formStatus', { ...formStatus, loading: true })

      const { userLoanDetailsResp, userLoanBalancesResp } = await user.fetchAll(api, market, true)

      const borrowedTokenDecimals = market.borrowed_token.decimals

      if (userLoanDetailsResp && userLoanBalancesResp) {
        const walletBorrowed = userLoanBalancesResp.borrowed
        const { borrowed: stateBorrowed = '0', debt: stateDebt = '0' } = userLoanDetailsResp.details?.state ?? {}

        const resp = await loanSelfLiquidation.detailInfo(api, market, maxSlippage)
        const { tokensToLiquidate, futureRates } = resp
        const liquidationAmt = isGreaterThanOrEqualTo(stateBorrowed, tokensToLiquidate, borrowedTokenDecimals)
          ? '0'
          : tokensToLiquidate

        sliceState.setStateByKeys({ liquidationAmt, futureRates })

        // validation
        const canSelfLiquidateWithStateBorrowed = isGreaterThanOrEqualTo(
          stateBorrowed,
          stateDebt,
          borrowedTokenDecimals,
        )
        const canSelfLiquidateWithWalletBorrowed = _canSelfLiquidate(walletBorrowed, tokensToLiquidate)
        const warning =
          !canSelfLiquidateWithStateBorrowed && !canSelfLiquidateWithWalletBorrowed
            ? FormWarning.NotEnoughCrvusd
            : formStatus.warning
        sliceState.setStateByKey('formStatus', { ...formStatus, error: resp.error || formStatus.error, warning })
      }

      sliceState.setStateByKey('formStatus', { ...get()[sliceKey].formStatus, loading: false })

      // api call
      void sliceState.fetchEstGasApproval(api, market, maxSlippage)
    },
    fetchEstGasApproval: async (api, market, maxSlippage) => {
      const { formStatus, ...sliceState } = get()[sliceKey]
      const { signerAddress } = api

      if (!signerAddress) return

      sliceState.setStateByKey('formEstGas', { ...DEFAULT_FORM_EST_GAS, loading: true })

      const resp = await loanSelfLiquidation.estGasApproval(market, maxSlippage)
      sliceState.setStateByKey('formEstGas', { ...DEFAULT_FORM_EST_GAS, estimatedGas: resp.estimatedGas })

      // update formStatus
      sliceState.setStateByKey('formStatus', {
        ...formStatus,
        isApproved: resp.isApproved,
        error: formStatus.error || resp.error,
      })
    },

    // step
    fetchStepApprove: async (api, market, maxSlippage) => {
      const { formStatus, ...sliceState } = get()[sliceKey]

      const { provider } = useWallet.getState()
      if (!provider) return setMissingProvider(get()[sliceKey])

      // update formStatus
      sliceState.setStateByKey('formStatus', { ...DEFAULT_FORM_STATUS, isInProgress: true, step: 'APPROVAL' })

      // api calls
      const { error, ...resp } = await loanSelfLiquidation.approve(provider, market)

      if (resp) {
        // update formStatus
        sliceState.setStateByKey('formStatus', {
          ...DEFAULT_FORM_STATUS,
          isApproved: !error,
          isInProgress: !error,
          stepError: error,
        })
        if (!error) void sliceState.fetchEstGasApproval(api, market, maxSlippage)
        return { ...resp, error }
      }
    },
    fetchStepLiquidate: async (api, market, liquidationAmt, maxSlippage) => {
      const { markets, user } = get()
      const { formStatus, ...sliceState } = get()[sliceKey]

      const { provider } = useWallet.getState()
      if (!provider) return setMissingProvider(get()[sliceKey])

      // update formStatus
      sliceState.setStateByKey('formStatus', {
        ...DEFAULT_FORM_STATUS,
        isApproved: true,
        isInProgress: true,
        step: 'SELF_LIQUIDATE',
      })

      // api calls
      const { error, ...resp } = await loanSelfLiquidation.selfLiquidate(provider, market, maxSlippage)

      if (resp) {
        const loanExists = (await user.fetchUserLoanExists(api, market, true))?.loanExists

        if (error) {
          sliceState.setStateByKey('formStatus', {
            ...DEFAULT_FORM_STATUS,
            isApproved: true,
            stepError: error,
          })
          return { ...resp, error, loanExists }
        } else {
          // api calls
          if (loanExists) void user.fetchAll(api, market, true)
          void markets.fetchAll(api, market, true)

          // update state
          sliceState.setStateByKey('formStatus', { ...DEFAULT_FORM_STATUS, isApproved: true, isComplete: true })
          return { ...resp, error, loanExists }
        }
      }
    },

    // slice helpers
    setStateByActiveKey: <T>(key: StateKey, activeKey: string, value: T) => {
      get().setAppStateByActiveKey(sliceKey, key, activeKey, value)
    },
    setStateByKey: <T>(key: StateKey, value: T) => {
      get().setAppStateByKey(sliceKey, key, value)
    },
    setStateByKeys: <T>(sliceState: Partial<SliceState>) => {
      get().setAppStateByKeys(sliceKey, sliceState)
    },
    resetState: () => {
      get().resetAppState(sliceKey, lodash.cloneDeep(DEFAULT_STATE))
    },
  },
})

export default createLoanSelfLiquidationSlice

export function _canSelfLiquidate(walletStablecoin: string, tokensToLiquidate: string) {
  return +(walletStablecoin ?? '0') >= +tokensToLiquidate * 1.0001
}
