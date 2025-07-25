import { styled } from 'styled-components'
import TableCellRewardsTooltip from '@/dex/components/PageDashboard/components/TableCellRewardsTooltip'
import { DetailText } from '@/dex/components/PageDashboard/components/TableRow'
import type { SortId } from '@/dex/components/PageDashboard/types'
import { SORT_ID } from '@/dex/components/PageDashboard/utils'
import TableCellRewardsBase from '@/dex/components/PagePoolList/components/TableCellRewardsBase'
import TableCellRewardsOthers from '@/dex/components/PagePoolList/components/TableCellRewardsOthers'
import PoolRewardsCrv from '@/dex/components/PoolRewardsCrv'
import { RewardsApy, PoolData } from '@/dex/types/main.types'
import { haveRewardsApy } from '@/dex/utils/utilsCurvejs'
import { Chip } from '@ui/Typography'
import { FORMAT_OPTIONS, formatNumber } from '@ui/utils'

const TableCellRewards = ({
  poolData,
  rewardsApy,
  rewardsApyKey,
  userCrvApy,
  sortBy,
  fetchUserPoolBoost,
}: {
  poolData: PoolData
  rewardsApy: RewardsApy | undefined
  rewardsApyKey: 'all' | 'baseApy' | 'rewardsApy'
  sortBy: SortId
  userCrvApy?: number
  fetchUserPoolBoost: (() => Promise<string>) | null
}) => {
  const { base, crv } = rewardsApy ?? {}
  const { haveCrv, haveOther } = haveRewardsApy(rewardsApy ?? {})
  const haveRewards = haveCrv || haveOther
  const boostedCrvApy = haveCrv && crv?.[1]
  const haveUserCrvApy = userCrvApy && !isNaN(userCrvApy)
  const { rewardsNeedNudging, areCrvRewardsStuckInBridge } = poolData?.gauge.status || {}
  const showUserCrvRewards = !!poolData && !rewardsNeedNudging && !areCrvRewardsStuckInBridge

  const Rewards = () => {
    const parsedUserCrvApy = `${formatNumber(userCrvApy, { ...FORMAT_OPTIONS.PERCENT, defaultValue: '-' })} CRV`
    return (
      <>
        {!showUserCrvRewards ? (
          <PoolRewardsCrv rewardsApy={rewardsApy} poolData={poolData} />
        ) : typeof userCrvApy !== 'undefined' && haveCrv ? (
          <Chip
            isBlock
            {...(haveUserCrvApy && boostedCrvApy && fetchUserPoolBoost
              ? {
                  tooltip: (
                    <TableCellRewardsTooltip
                      crv={crv}
                      userCrvApy={userCrvApy}
                      fetchUserPoolBoost={fetchUserPoolBoost}
                    />
                  ),
                  tooltipProps: {
                    textAlign: 'left',
                    minWidth: '300px',
                  },
                }
              : {})}
            size="md"
          >
            {sortBy === SORT_ID.userCrvApy ? <strong>{parsedUserCrvApy}</strong> : parsedUserCrvApy}{' '}
            {boostedCrvApy ? <DetailText> of {formatNumber(boostedCrvApy, FORMAT_OPTIONS.PERCENT)}</DetailText> : null}
          </Chip>
        ) : null}
        <TableCellRewardsOthers isHighlight={sortBy === SORT_ID.rewardOthers} rewardsApy={rewardsApy} />
      </>
    )
  }

  if (rewardsApyKey === 'baseApy') {
    return (
      <RewardsWrapper>
        <TableCellRewardsBase base={rewardsApy?.base} isHighlight={sortBy === SORT_ID.rewardBase} poolData={poolData} />
      </RewardsWrapper>
    )
  } else if (rewardsApyKey === 'rewardsApy') {
    return <RewardsWrapper>{haveRewards ? <Rewards /> : null}</RewardsWrapper>
  } else if (rewardsApyKey === 'all') {
    return (
      <RewardsWrapper>
        {typeof base?.day !== 'undefined' ? (
          <div>
            <TableCellRewardsBase
              base={rewardsApy?.base}
              isHighlight={sortBy === SORT_ID.rewardBase}
              poolData={poolData}
            />
          </div>
        ) : (
          '-'
        )}
        {haveRewards ? <Rewards /> : null}
      </RewardsWrapper>
    )
  }

  return null
}

const RewardsWrapper = styled.div`
  line-height: 1.2;
`

export default TableCellRewards
