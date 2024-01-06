export interface IBlockchainInfoUTXO {
    tx_hash_big_endian: string
    tx_hash: string
    tx_output_n: number
    script: string
    value: number
    value_hex: string
    confirmations: number
    tx_index: number
}
