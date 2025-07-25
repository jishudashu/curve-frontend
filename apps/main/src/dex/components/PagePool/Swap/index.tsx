import lodash from 'lodash'
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { ethAddress } from 'viem'
import AlertFormError from '@/dex/components/AlertFormError'
import AlertFormWarning from '@/dex/components/AlertFormWarning'
import AlertSlippage from '@/dex/components/AlertSlippage'
import ChipInpHelper from '@/dex/components/ChipInpHelper'
import DetailInfoEstGas from '@/dex/components/DetailInfoEstGas'
import FieldHelperUsdRate from '@/dex/components/FieldHelperUsdRate'
import DetailInfoSlippageTolerance from '@/dex/components/PagePool/components/DetailInfoSlippageTolerance'
import TransferActions from '@/dex/components/PagePool/components/TransferActions'
import WarningModal from '@/dex/components/PagePool/components/WarningModal'
import { FieldsWrapper } from '@/dex/components/PagePool/styles'
import type { ExchangeOutput, FormStatus, FormValues, StepKey } from '@/dex/components/PagePool/Swap/types'
import { DEFAULT_EST_GAS, DEFAULT_EXCHANGE_OUTPUT, getSwapTokens } from '@/dex/components/PagePool/Swap/utils'
import type { EstimatedGas as FormEstGas, PageTransferProps, Seed } from '@/dex/components/PagePool/types'
import DetailInfoExchangeRate from '@/dex/components/PageRouterSwap/components/DetailInfoExchangeRate'
import DetailInfoPriceImpact from '@/dex/components/PageRouterSwap/components/DetailInfoPriceImpact'
import useStore from '@/dex/store/useStore'
import { Balances, CurveApi, PoolAlert, PoolData, TokensMapper } from '@/dex/types/main.types'
import { toTokenOption } from '@/dex/utils'
import { getSlippageImpact } from '@/dex/utils/utilsSwap'
import AlertBox from '@ui/AlertBox'
import Box from '@ui/Box'
import Checkbox from '@ui/Checkbox'
import Icon from '@ui/Icon'
import IconButton from '@ui/IconButton'
import InputProvider, { InputDebounced, InputMaxBtn } from '@ui/InputComp'
import Stepper from '@ui/Stepper'
import { getActiveStep, getStepStatus } from '@ui/Stepper/helpers'
import type { Step } from '@ui/Stepper/types'
import TxInfoBar from '@ui/TxInfoBar'
import { formatNumber } from '@ui/utils'
import { notify } from '@ui-kit/features/connect-wallet'
import { useLayoutStore } from '@ui-kit/features/layout'
import { TokenSelector } from '@ui-kit/features/select-token'
import usePageVisibleInterval from '@ui-kit/hooks/usePageVisibleInterval'
import { t } from '@ui-kit/lib/i18n'
import { REFRESH_INTERVAL } from '@ui-kit/lib/model'
import { useTokenUsdRate } from '@ui-kit/lib/model/entities/token-usd-rate'

const { cloneDeep, isNaN, isUndefined } = lodash

const Swap = ({
  chainIdPoolId,
  curve,
  maxSlippage,
  poolAlert,
  poolData,
  poolDataCacheOrApi,
  routerParams,
  seed,
  tokensMapper,
  userPoolBalances,
  userPoolBalancesLoading,
}: Pick<PageTransferProps, 'curve' | 'params' | 'poolData' | 'poolDataCacheOrApi' | 'routerParams'> & {
  chainIdPoolId: string
  poolAlert: PoolAlert | null
  maxSlippage: string
  seed: Seed
  tokensMapper: TokensMapper
  userPoolBalances: Balances | undefined
  userPoolBalancesLoading: boolean
}) => {
  const isSubscribed = useRef(false)

  const { chainId, signerAddress } = curve || {}
  const { rChainId } = routerParams
  const activeKey = useStore((state) => state.poolSwap.activeKey)
  const exchangeOutput = useStore((state) => state.poolSwap.exchangeOutput[activeKey] ?? DEFAULT_EXCHANGE_OUTPUT)
  const formEstGas = useStore((state) => state.poolSwap.formEstGas[activeKey] ?? DEFAULT_EST_GAS)
  const formStatus = useStore((state) => state.poolSwap.formStatus)
  const formValues = useStore((state) => state.poolSwap.formValues)
  const hasRouter = useStore((state) => state.hasRouter)
  const isMaxLoading = useStore((state) => state.poolSwap.isMaxLoading)
  const isPageVisible = useLayoutStore((state) => state.isPageVisible)
  const fetchUserPoolInfo = useStore((state) => state.user.fetchUserPoolInfo)
  const fetchStepApprove = useStore((state) => state.poolSwap.fetchStepApprove)
  const fetchStepSwap = useStore((state) => state.poolSwap.fetchStepSwap)
  const resetState = useStore((state) => state.poolSwap.resetState)
  const setFormValues = useStore((state) => state.poolSwap.setFormValues)
  const setPoolIsWrapped = useStore((state) => state.pools.setPoolIsWrapped)
  const network = useStore((state) => (chainId ? state.networks.networks[chainId] : null))

  const slippageImpact = exchangeOutput ? getSlippageImpact({ maxSlippage, ...exchangeOutput }) : null

  const [steps, setSteps] = useState<Step[]>([])
  const [confirmedLoss, setConfirmedLoss] = useState(false)
  const [txInfoBar, setTxInfoBar] = useState<ReactNode>(null)

  const poolId = poolData?.pool?.id
  const haveSigner = !!signerAddress

  const userFromBalance = userPoolBalances?.[formValues.fromAddress]
  const userToBalance = userPoolBalances?.[formValues.toAddress]

  const { data: fromUsdRate } = useTokenUsdRate(
    { chainId, tokenAddress: formValues.fromAddress },
    !!formValues.fromAddress,
  )

  const { data: toUsdRate } = useTokenUsdRate({ chainId, tokenAddress: formValues.toAddress }, !!formValues.toAddress)

  const { selectList, swapTokensMapper } = useMemo(() => {
    const { selectList, swapTokensMapper } = getSwapTokens(tokensMapper, poolDataCacheOrApi)

    return {
      selectList: selectList.map(toTokenOption(network?.networkId)),
      swapTokensMapper,
    }
  }, [poolDataCacheOrApi, tokensMapper, network?.networkId])

  const fromToken = selectList.find((x) => x.address.toLocaleLowerCase() == formValues.fromAddress)
  const toToken = selectList.find((x) => x.address.toLocaleLowerCase() == formValues.toAddress)

  const updateFormValues = useCallback(
    (updatedFormValues: Partial<FormValues>, isGetMaxFrom: boolean | null, updatedMaxSlippage: string | null) => {
      setConfirmedLoss(false)
      setTxInfoBar(null)

      void setFormValues(
        curve,
        poolDataCacheOrApi.pool.id,
        poolData,
        updatedFormValues,
        isGetMaxFrom,
        seed.isSeed,
        updatedMaxSlippage || maxSlippage,
      )
    },
    [setFormValues, curve, poolDataCacheOrApi.pool.id, poolData, seed.isSeed, maxSlippage],
  )

  const handleSwapClick = useCallback(
    async (
      actionActiveKey: string,
      curve: CurveApi,
      poolData: PoolData,
      formValues: FormValues,
      maxSlippage: string,
    ) => {
      const { fromAmount, fromToken, toToken } = formValues
      const notifyMessage = t`Please confirm swap ${fromAmount} ${fromToken} for ${toToken} at max slippage ${maxSlippage}%.`
      const { dismiss } = notify(notifyMessage, 'pending')
      const resp = await fetchStepSwap(actionActiveKey, curve, poolData, formValues, maxSlippage)

      if (isSubscribed.current && resp && resp.hash && resp.activeKey === activeKey && network) {
        setTxInfoBar(
          <TxInfoBar
            description={`Swapped ${fromAmount} ${fromToken}.`}
            txHash={network.scanTxPath(resp.hash)}
            onClose={() => {
              updateFormValues({}, null, null)
            }}
          />,
        )
      }
      if (typeof dismiss === 'function') dismiss()
    },
    [activeKey, fetchStepSwap, updateFormValues, network],
  )

  const getSteps = useCallback(
    (
      actionActiveKey: string,
      curve: CurveApi,
      poolData: PoolData,
      formEstGas: FormEstGas,
      formValues: FormValues,
      formStatus: FormStatus,
      exchangeOutput: ExchangeOutput,
      confirmedLoss: boolean,
      steps: Step[],
      isSeed: boolean,
      maxSlippage: string,
      userPoolBalancesLoading: boolean,
    ) => {
      const { formProcessing, formTypeCompleted, step } = formStatus
      const isValid =
        !userPoolBalancesLoading &&
        !isSeed &&
        !formStatus.error &&
        !formValues.fromError &&
        !formValues.toError &&
        +formValues.fromAmount > 0
      const isApprove = formStatus.isApproved || formStatus.formTypeCompleted === 'APPROVE'
      const isComplete = formTypeCompleted === 'SWAP'

      const stepsObj: { [key: string]: Step } = {
        APPROVAL: {
          key: 'APPROVAL',
          status: getStepStatus(isApprove, step === 'APPROVAL', isValid && !formProcessing),
          type: 'action',
          content: isApprove ? t`Spending Approved` : t`Approve Spending`,
          onClick: async () => {
            const notifyMessage = t`Please approve spending your ${formValues.fromToken}.`
            const { dismiss } = notify(notifyMessage, 'pending')
            await fetchStepApprove(actionActiveKey, curve, poolData.pool, formValues, maxSlippage)
            if (typeof dismiss === 'function') dismiss()
          },
        },
        SWAP: {
          key: 'SWAP',
          status: getStepStatus(isComplete, step === 'SWAP', formStatus.isApproved && isValid),
          type: 'action',
          content: isComplete ? t`Swap Complete` : t`Swap`,
          ...(exchangeOutput.modal
            ? {
                modal: {
                  title: t`Warning!`,
                  content: (
                    // TODO: fix typescript error
                    // @ts-ignore
                    <WarningModal {...exchangeOutput.modal} confirmed={confirmedLoss} setConfirmed={setConfirmedLoss} />
                  ),
                  cancelBtnProps: {
                    label: t`Cancel`,
                    onClick: () => {
                      setConfirmedLoss(false)
                    },
                  },
                  isDismissable: false,
                  primaryBtnProps: {
                    onClick: () => handleSwapClick(actionActiveKey, curve, poolData, formValues, maxSlippage),
                    disabled: !confirmedLoss,
                  },
                  primaryBtnLabel: 'Swap anyway',
                },
              }
            : { onClick: () => handleSwapClick(actionActiveKey, curve, poolData, formValues, maxSlippage) }),
        },
      }

      let stepsKey: StepKey[]

      if (formStatus.formProcessing || formStatus.formTypeCompleted) {
        stepsKey = steps.map((s) => s.key as StepKey)
      } else {
        stepsKey = formStatus.isApproved ? ['SWAP'] : ['APPROVAL', 'SWAP']
      }

      return stepsKey.map((key) => stepsObj[key])
    },
    [fetchStepApprove, handleSwapClick],
  )

  const fetchData = useCallback(() => {
    if (curve && poolData && isPageVisible && !formStatus.formProcessing && !formStatus.formTypeCompleted) {
      updateFormValues({}, null, '')
    }
  }, [curve, formStatus.formProcessing, formStatus.formTypeCompleted, isPageVisible, poolData, updateFormValues])

  // onMount
  useEffect(() => {
    isSubscribed.current = true

    return () => {
      isSubscribed.current = false
    }
  }, [])

  useEffect(() => {
    if (poolId) {
      resetState(poolData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId])

  // get user balances
  useEffect(() => {
    if (curve && poolId && haveSigner && (isUndefined(userFromBalance) || isUndefined(userToBalance))) {
      void fetchUserPoolInfo(curve, poolId, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, poolId, haveSigner, userFromBalance, userToBalance])

  // curve state change
  useEffect(() => {
    if (chainId && poolId) {
      updateFormValues({}, null, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, poolId, signerAddress, seed.isSeed])

  // maxSlippage
  useEffect(() => {
    updateFormValues({}, null, maxSlippage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSlippage])

  // steps
  useEffect(() => {
    if (curve && poolData && seed.isSeed !== null) {
      const updatedSteps = getSteps(
        activeKey,
        curve,
        poolData,
        formEstGas,
        formValues,
        formStatus,
        exchangeOutput,
        confirmedLoss,
        steps,
        seed.isSeed,
        maxSlippage,
        userPoolBalancesLoading,
      )
      setSteps(updatedSteps)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chainId,
    poolId,
    confirmedLoss,
    exchangeOutput?.modal,
    formEstGas,
    formStatus,
    formValues,
    maxSlippage,
    seed.isSeed,
    userPoolBalancesLoading,
  ])

  // pageVisible
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => fetchData(), [isPageVisible])

  // re-fetch data
  usePageVisibleInterval(() => fetchData(), REFRESH_INTERVAL['1m'], isPageVisible)

  const activeStep = haveSigner ? getActiveStep(steps) : null
  const isDisabled = seed.isSeed === null || seed.isSeed || formStatus.formProcessing

  return (
    <>
      {/* input fields */}
      <FieldsWrapper>
        <div>
          <Box grid gridGap={1}>
            <StyledInputProvider
              id="fromAmount"
              grid
              gridTemplateColumns="1fr auto 38%"
              inputVariant={formValues.fromError ? 'error' : undefined}
              disabled={isDisabled}
            >
              <InputDebounced
                id="inpFromAmount"
                type="number"
                labelProps={
                  haveSigner && {
                    label: t`Avail.`,
                    descriptionLoading: userPoolBalancesLoading,
                    description: formatNumber(userFromBalance),
                  }
                }
                value={formValues.fromAmount}
                onChange={(fromAmount) => {
                  updateFormValues({ isFrom: true, fromAmount, toAmount: '' }, null, null)
                }}
              />
              <InputMaxBtn
                disabled={isDisabled || isMaxLoading}
                loading={isMaxLoading}
                isNetworkToken={formValues.fromAddress.toLowerCase() === ethAddress}
                onClick={() => {
                  updateFormValues({ isFrom: true, fromAmount: '', toAmount: '' }, true, null)
                }}
              />

              <TokenSelector
                selectedToken={fromToken}
                tokens={selectList}
                disabled={isDisabled || selectList.length === 0}
                showSearch={false}
                showManageList={false}
                compact={true}
                onToken={(token) => {
                  const val = token.address
                  const cFormValues = cloneDeep(formValues)
                  if (val === formValues.toAddress) {
                    cFormValues.toAddress = formValues.fromAddress
                    cFormValues.toToken = swapTokensMapper[formValues.fromAddress].symbol
                  }

                  cFormValues.fromAddress = val
                  cFormValues.fromToken = swapTokensMapper[val].symbol

                  if (formValues.isFrom || formValues.isFrom === null) {
                    cFormValues.toAmount = ''
                  } else {
                    cFormValues.fromAmount = ''
                  }

                  updateFormValues(cFormValues, null, '')
                }}
              />
            </StyledInputProvider>
            <FieldHelperUsdRate amount={formValues.fromAmount} usdRate={fromUsdRate} />
            {formValues.fromError && (
              <ChipInpHelper size="xs" isDarkBg isError>
                {t`Amount > wallet balance ${formatNumber(userFromBalance)}`}
              </ChipInpHelper>
            )}
          </Box>

          <Box flex flexJustifyContent="center">
            <IconButton
              disabled={isDisabled}
              onClick={() => {
                const cFormValues = cloneDeep(formValues)
                cFormValues.isFrom = true
                cFormValues.fromAmount = formValues.toAmount
                cFormValues.fromToken = formValues.toToken
                cFormValues.fromAddress = formValues.toAddress
                cFormValues.toToken = formValues.fromToken
                cFormValues.toAddress = formValues.fromAddress
                cFormValues.toAmount = ''

                updateFormValues(cFormValues, null, '')
              }}
              size="medium"
            >
              <Icon name="ArrowsVertical" size={24} aria-label="icon arrow vertical" />
            </IconButton>
          </Box>
        </div>

        {/* if hasRouter value is false, it means entering toAmount is not ready */}
        <div>
          <StyledInputProvider
            id="toAmount"
            inputVariant={formValues.toError ? 'error' : undefined}
            disabled={isUndefined(hasRouter) || (!isUndefined(hasRouter) && !hasRouter) || isDisabled}
            grid
            gridTemplateColumns="1fr 38%"
          >
            <InputDebounced
              id="inpToAmount"
              type="number"
              labelProps={
                haveSigner && {
                  label: t`Avail.`,
                  descriptionLoading: userPoolBalancesLoading,
                  description: formatNumber(userToBalance),
                }
              }
              value={formValues.toAmount}
              onChange={(toAmount) => {
                updateFormValues({ isFrom: false, toAmount, fromAmount: '' }, null, '')
              }}
            />

            <TokenSelector
              selectedToken={toToken}
              tokens={selectList}
              disabled={isDisabled || selectList.length === 0}
              showSearch={false}
              showManageList={false}
              compact={true}
              onToken={(token) => {
                const val = token.address
                const cFormValues = cloneDeep(formValues)
                if (val === formValues.fromAddress) {
                  cFormValues.fromAddress = formValues.toAddress
                  cFormValues.fromToken = swapTokensMapper[formValues.toAddress].symbol
                }

                cFormValues.toAddress = val
                cFormValues.toToken = swapTokensMapper[val].symbol

                if (formValues.isFrom || formValues.isFrom === null) {
                  cFormValues.toAmount = ''
                } else {
                  cFormValues.fromAmount = ''
                }
                updateFormValues(cFormValues, null, '')
              }}
            />
          </StyledInputProvider>
          <FieldHelperUsdRate amount={formValues.toAmount} usdRate={toUsdRate} />
        </div>

        {poolDataCacheOrApi.hasWrapped && formValues.isWrapped !== null && (
          <div>
            <Checkbox
              isDisabled={isDisabled || !poolData || network?.poolIsWrappedOnly[poolDataCacheOrApi.pool.id]}
              isSelected={formValues.isWrapped}
              onChange={(isWrapped) => {
                if (poolData) {
                  const fromIdx = poolData.tokenAddresses.findIndex((a) => a === formValues.fromAddress)
                  const toIdx = poolData.tokenAddresses.findIndex((a) => a === formValues.toAddress)
                  const wrapped = setPoolIsWrapped(poolData, isWrapped)
                  const cFormValues = cloneDeep(formValues)
                  cFormValues.isWrapped = isWrapped
                  cFormValues.fromToken = wrapped.tokens[fromIdx]
                  cFormValues.fromAddress = wrapped.tokenAddresses[fromIdx]
                  cFormValues.toToken = wrapped.tokens[toIdx]
                  cFormValues.toAddress = wrapped.tokenAddresses[toIdx]

                  if (cFormValues.isFrom) {
                    cFormValues.toAmount = ''
                  } else {
                    cFormValues.fromAmount = ''
                  }

                  updateFormValues(cFormValues, null, '')
                }
              }}
            >
              {t`Swap Wrapped`}
            </Checkbox>
          </div>
        )}
      </FieldsWrapper>

      <Box>
        <DetailInfoExchangeRate exchangeRates={exchangeOutput.exchangeRates} loading={exchangeOutput.loading} />

        <DetailInfoPriceImpact
          loading={exchangeOutput.loading}
          priceImpact={exchangeOutput.priceImpact}
          isHighImpact={slippageImpact?.isHighImpact ?? null}
        />

        {haveSigner && (
          <DetailInfoEstGas
            isDivider
            chainId={rChainId}
            {...formEstGas}
            stepProgress={activeStep && steps.length > 1 ? { active: activeStep, total: steps.length } : null}
          />
        )}
        <DetailInfoSlippageTolerance maxSlippage={maxSlippage} stateKey={chainIdPoolId} />
      </Box>

      {poolAlert && poolAlert?.isInformationOnlyAndShowInForm && (
        <AlertBox {...poolAlert}>{poolAlert.message}</AlertBox>
      )}

      <AlertSlippage
        maxSlippage={maxSlippage}
        usdAmount={
          !isUndefined(toUsdRate) && !isNaN(toUsdRate)
            ? (Number(formValues.toAmount) * Number(toUsdRate)).toString()
            : ''
        }
      />
      <AlertFormWarning errorKey={formStatus.warning} />
      <AlertFormError
        errorKey={formStatus.error}
        handleBtnClose={() => {
          updateFormValues({}, null, null)
        }}
      />

      {formValues.toError ? (
        <AlertBox alertType="error">{t`The entered amount exceeds the available currency reserves.`}</AlertBox>
      ) : null}

      {/* actions*/}
      <TransferActions
        poolData={poolData}
        poolDataCacheOrApi={poolDataCacheOrApi}
        loading={!chainId || !steps.length || !seed.loaded}
        routerParams={routerParams}
        seed={seed}
        userPoolBalances={userPoolBalances}
      >
        {txInfoBar}
        <Stepper steps={steps} />
      </TransferActions>
    </>
  )
}

const StyledInputProvider = styled(InputProvider)`
  padding-right: var(--spacing-1);
`

export default Swap
