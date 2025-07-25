import { ReactNode } from 'react'
import { styled } from 'styled-components'
import Button from '@ui/Button'
import Icon from '@ui/Icon'

type ExternalLinkIconButtonProps = {
  href: string
  children: ReactNode
}

interface StyledButtonProps {
  href?: string
  target?: string
  rel?: string
  variant?: string
}

const ExternalLinkIconButton = ({ href, children }: ExternalLinkIconButtonProps) => (
  <StyledButton variant="filled" as="a" href={href} target="_blank" rel="noopener noreferrer">
    {children}
    <Icon name="Launch" size={16} />
  </StyledButton>
)

const StyledButton = styled(Button)<StyledButtonProps>`
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  color: var(--page--text-color);
  font-size: var(--font-size-2);
  text-transform: none;
  text-decoration: none;
`

export default ExternalLinkIconButton
