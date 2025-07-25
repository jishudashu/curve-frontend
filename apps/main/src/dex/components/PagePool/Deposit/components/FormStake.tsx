import BigNumber from 'bignumber.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import AlertFormError from '@/dex/components/AlertFormError'
import DetailInfoEstGas from '@/dex/components/DetailInfoEstGas'
import { DEFAULT_ESTIMATED_GAS } from '@/dex/components/PagePool'
import DetailInfoExpectedApy from '@/dex/components/PagePool/components/DetailInfoExpectedApy'
import FieldLpToken from '@/dex/components/PagePool/components/FieldLpToken'
import TransferActions from '@/dex/components/PagePool/components/TransferActions'
import type { FormStatus, FormValues, StepKey } from '@/dex/components/PagePool/Deposit/types'
import { FieldsWrapper } from '@/dex/components/PagePool/styles'
import type { TransferProps } from '@/dex/components/PagePool/types'
import useStore from '@/dex/store/useStore'
import { CurveApi, Pool, PoolData } from '@/dex/types/main.types'
import AlertBox from '@ui/AlertBox'
import Stepper from '@ui/Stepper'
import { getActiveStep, getStepStatus } from '@ui/Stepper/helpers'
import type { Step } from '@ui/Stepper/types'
import TxInfoBar from '@ui/TxInfoBar'
import { formatNumber } from '@ui/utils'
import { notify } from '@ui-kit/features/connect-wallet'
import { t } from '@ui-kit/lib/i18n'

const FormStake = ({ curve, poolData, poolDataCacheOrApi, routerParams, seed, userPoolBalances }: TransferProps) => {
  const isSubscribed = useRef(false)

  const { chainId, signerAddress } = curve || {}
  const { rChainId } = routerParams
  const activeKey = useStore((state) => state.poolDeposit.activeKey)
  const balancesLoading = useStore((state) => state.user.walletBalancesLoading)
  const formEstGas = useStore((state) => state.poolDeposit.formEstGas[activeKey] ?? DEFAULT_ESTIMATED_GAS)
  const formStatus = useStore((state) => state.poolDeposit.formStatus)
  const formValues = useStore((state) => state.poolDeposit.formValues)
  const rewardsApy = useStore((state) => state.pools.rewardsApyMapper[rChainId]?.[poolDataCacheOrApi.pool.id])
  const fetchStepApprove = useStore((state) => state.poolDeposit.fetchStepStakeApprove)
  const fetchStepStake = useStore((state) => state.poolDeposit.fetchStepStake)
  const setFormValues = useStore((state) => state.poolDeposit.setFormValues)
  const resetState = useStore((state) => state.poolDeposit.resetState)
  const network = useStore((state) => (chainId ? state.networks.networks[chainId] : null))

  const [steps, setSteps] = useState<Step[]>([])
  const [txInfoBar, setTxInfoBar] = useState<ReactNode>(null)

  const poolId = poolData?.pool?.id
  const haveSigner = !!signerAddress

  const updateFormValues = useCallback(
    (updatedFormValues: Partial<FormValues>) => {
      setTxInfoBar(null)
      void setFormValues('STAKE', curve, poolDataCacheOrApi.pool.id, poolData, updatedFormValues, null, seed.isSeed, '')
    },
    [curve, poolData, poolDataCacheOrApi.pool.id, seed.isSeed, setFormValues],
  )

  const handleApproveClick = useCallback(
    async (activeKey: string, curve: CurveApi, pool: Pool, formValues: FormValues) => {
      const notifyMessage = t`Please approve spending your LP Tokens.`
      const { dismiss } = notify(notifyMessage, 'pending')
      await fetchStepApprove(activeKey, curve, 'STAKE', pool, formValues)
      if (typeof dismiss === 'function') dismiss()
    },
    [fetchStepApprove],
  )

  const handleStakeClick = useCallback(
    async (activeKey: string, curve: CurveApi, poolData: PoolData, formValues: FormValues) => {
      const notifyMessage = t`Please confirm staking of ${formValues.lpToken} LP Tokens`
      const { dismiss } = notify(notifyMessage, 'pending')
      const resp = await fetchStepStake(activeKey, curve, poolData, formValues)

      if (isSubscribed.current && resp && resp.hash && resp.activeKey === activeKey && network) {
        const TxDescription = `Staked ${formValues.lpToken} LP Tokens`
        setTxInfoBar(<TxInfoBar description={TxDescription} txHash={network.scanTxPath(resp.hash)} />)
      }
      if (typeof dismiss === 'function') dismiss()
    },
    [fetchStepStake, network],
  )

  const getSteps = useCallback(
    (
      activeKey: string,
      curve: CurveApi,
      poolData: PoolData,
      formValues: FormValues,
      formStatus: FormStatus,
      steps: Step[],
    ) => {
      const isValid = !formStatus.error && +formValues.lpToken > 0
      const isApproved = formStatus.isApproved || formStatus.formTypeCompleted === 'APPROVE'
      const isComplete = formStatus.formTypeCompleted === 'STAKE'

      const stepsObj: { [key: string]: Step } = {
        APPROVAL: {
          key: 'APPROVAL',
          status: getStepStatus(isApproved, formStatus.step === 'APPROVAL', isValid && !formStatus.formProcessing),
          type: 'action',
          content: isApproved ? t`Spending Approved` : t`Approve Spending`,
          onClick: () => handleApproveClick(activeKey, curve, poolData.pool, formValues),
        },
        STAKE: {
          key: 'STAKE',
          status: getStepStatus(isComplete, formStatus.step === 'STAKE', isValid && formStatus.isApproved),
          type: 'action',
          content: isComplete ? t`Stake Complete` : t`Stake`,
          onClick: () => handleStakeClick(activeKey, curve, poolData, formValues),
        },
      }

      let stepsKey: StepKey[]

      if (formStatus.formProcessing || formStatus.formTypeCompleted) {
        stepsKey = steps.map((s) => s.key as StepKey)
      } else {
        stepsKey = formStatus.isApproved ? ['STAKE'] : ['APPROVAL', 'STAKE']
      }

      return stepsKey.map((key) => stepsObj[key])
    },
    [handleApproveClick, handleStakeClick],
  )

  // onMount
  useEffect(() => {
    isSubscribed.current = true

    return () => {
      isSubscribed.current = false
    }
  }, [])

  useEffect(() => {
    if (poolId) {
      resetState(poolData, 'STAKE')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId])

  // curve state change
  useEffect(() => {
    if (chainId && poolId) {
      updateFormValues({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, poolId, signerAddress, seed.isSeed])

  // steps
  useEffect(() => {
    if (curve && poolId) {
      const updatedSteps = getSteps(activeKey, curve, poolData, formValues, formStatus, steps)
      setSteps(updatedSteps)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, poolId, signerAddress, formValues, formStatus])

  const activeStep = signerAddress ? getActiveStep(steps) : null
  const disableForm = seed.isSeed === null || formStatus.formProcessing
  const balLpToken = (userPoolBalances?.lpToken as string) ?? '0'

  return (
    <>
      {/* input fields */}
      <FieldsWrapper>
        <FieldLpToken
          amount={formValues.lpToken}
          balance={formatNumber(balLpToken)}
          balanceLoading={balancesLoading}
          hasError={haveSigner ? new BigNumber(formValues.lpToken).isGreaterThan(balLpToken as string) : false}
          haveSigner={haveSigner}
          handleAmountChange={(lpToken) => updateFormValues({ lpToken })}
          disabledMaxButton={disableForm || !haveSigner}
          disableInput={disableForm}
          handleMaxClick={() => {
            updateFormValues({ lpToken: (userPoolBalances?.lpToken as string) ?? '0' })
          }}
        />
      </FieldsWrapper>

      <div>
        <DetailInfoExpectedApy
          lpTokenAmount={formValues.lpToken}
          poolDataCacheOrApi={poolDataCacheOrApi}
          crvApr={rewardsApy?.crv?.[0]}
        />

        {haveSigner && (
          <DetailInfoEstGas
            chainId={rChainId}
            {...formEstGas}
            stepProgress={activeStep && steps.length > 1 ? { active: activeStep, total: steps.length } : null}
          />
        )}
      </div>

      <TransferActions
        poolData={poolData}
        poolDataCacheOrApi={poolDataCacheOrApi}
        loading={!chainId || !steps.length || !seed.loaded}
        routerParams={routerParams}
        seed={seed}
        userPoolBalances={userPoolBalances}
      >
        {formStatus.error === 'lpToken-too-much' ? (
          <AlertBox alertType="error">{t`Not enough LP Tokens balances.`}</AlertBox>
        ) : formStatus.error ? (
          <AlertFormError errorKey={formStatus.error} handleBtnClose={() => updateFormValues({})} />
        ) : null}
        {txInfoBar}
        <Stepper steps={steps} />
      </TransferActions>
    </>
  )
}

export default FormStake
