import Box from '@mui/material/Box'
import type { NetworkDef } from '@ui/utils'
import Image from '@ui-kit/shared/image'

type ChainIconProps = {
  network: NetworkDef
  size?: number
}

/**
 * Display a chain icon for the chain switcher.
 * This is different from icons/ChainIcon because it requires a fixed size, some padding and no responsive design.
 */
export const ChainSwitcherIcon = ({ network: { chainId, name, logoSrc }, size = 28 }: ChainIconProps) => (
  <Box component="span" alignItems="center" display="flex" data-testid={`chain-icon-${chainId}`}>
    <Image
      alt={name}
      // onError={(evt) => (evt.target as HTMLImageElement).src = src}
      src={logoSrc}
      loading="lazy"
      width={size}
      height={size}
    />
  </Box>
)
