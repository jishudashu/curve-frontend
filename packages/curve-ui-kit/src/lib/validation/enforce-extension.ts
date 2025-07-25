import isDecimal from 'validator/lib/isDecimal'
import { isAddress, zeroAddress } from 'viem'

export const extendEnforce = (enforce: typeof import('vest').enforce) =>
  enforce.extend({
    isDecimal,
    isAddress: <T>(value: T) => ({
      pass: !!value && typeof value === 'string' && isAddress(value),
      message: () => 'Must be a valid Ethereum address',
    }),
    isNotZeroAddress: <T>(value: T) => ({
      pass: value !== zeroAddress,
      message: () => 'Address cannot be the zero address',
    }),
    isPositiveNumber: <T>(value: T) => ({
      pass: typeof value === 'number' && value > 0,
      message: () => 'Must be a positive number',
    }),
    isValidChainId: <T>(value: T) => ({
      pass: typeof value === 'number', // && value > 0,
      message: () => 'Must be a valid chain ID',
    }),
    isValidChainName: <T>(value: T) => ({
      pass: typeof value === 'string',
      message: () => 'Must be a valid chain name',
    }),
  })
