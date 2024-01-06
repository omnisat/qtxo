import axios from 'axios'
import dotenv from 'dotenv';
import {IBlockchainInfoUTXO} from "./types";
dotenv.config();

export const getUnspentsForAddress = async (address: string) => {
    try {
        const response = await callBTCRPCEndpoint('esplora_address::utxo', address)
        if (response?.result?.length === 0) {
            return []
        }

        if (response?.result?.length === 0) {
            return []
        }

        const utxo = response.result[0]
        const { result: txDetails } = await callBTCRPCEndpoint(
            'esplora_tx',
            utxo.txid
        )

        const voutEntry = txDetails.vout.find(
            (v: { scriptpubkey_address: string }) =>
                v.scriptpubkey_address === address
        )

        const formattedUtxos = []

        for (const utxo of response.result) {
            const script = voutEntry ? voutEntry.scriptpubkey : ''
            formattedUtxos.push({
                tx_hash_big_endian: utxo.txid,
                tx_output_n: utxo.vout,
                value: utxo.value,
                confirmations: utxo.status.confirmed ? 3 : 0,
                script: script,
                tx_index: 0,
            })
        }

        return formattedUtxos as IBlockchainInfoUTXO[]
    } catch (e: any) {
        throw new Error(e)
    }
}

export const RPC_ADDR = `https://${process.env["NETWORK"]}.sandshrew.io/v1/${process.env["SANDSHREW_API_KEY"]}`

export const callBTCRPCEndpoint = async (method: string, params: string) => {
    const data = JSON.stringify({
        jsonrpc: '2.0',
        id: method,
        method: method,
        params: [params],
    })

    return await axios.post(RPC_ADDR, data, {
            headers: {
                'content-type': 'application/json',
            },
        })
        .then((res: { data: any }) => res.data)
        .catch((e: { response: any }) => {
            console.error(e.response)
            throw e
        })
}
