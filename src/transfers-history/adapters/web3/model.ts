export type Web3Error = {
  error: {
    code: Web3ErrorCode;
  };
};

export enum Web3ErrorCode {
  BLOCK_RANGE_TOO_LARGE = -32005,
}

export type ChainId = number;

export const CHAIN_IDs = {
  ARBITRUM_RINKEBY: 421611,
  RINKEBY: 4,
  OPTIMISM_KOVAN: 69,
  KOVAN: 42,
  MAINNET: 1,
};
