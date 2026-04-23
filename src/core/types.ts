export type Pool = {
    address: string
  
    tokenA: string
    tokenB: string
  
    reserveA: number
    reserveB: number
  
    fee: number // наприклад 0.003 (0.3%)
  
    decimalsA: number
    decimalsB: number
}

export function getSpotPrice(pool: Pool): number {
    // ціна A в термінах B
    return pool.reserveB / pool.reserveA
  }