import express from 'express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { getUnspentsForAddress } from "./lib/utxos";

import dotenv from 'dotenv';
import {IBlockchainInfoUTXO} from "./lib/types";
dotenv.config();

const app = express();

const port = process.env.PORT || 3031;
const redis = new IORedis(String(process.env["REDIS_URL"]));
const UTXO_CACHE_TIME_SECS = parseInt(String(process.env["UTXO_CACHE_TIME_SECS"])) || 15;


const utxoQueue = new Queue('utxos', { connection: redis });

app.get('/utxos/:address/:amount', async (req, res) => {
    const { address, amount } = req.params;
    const requestedAmount = parseInt(amount);

    try {
        // Fetch new UTXOs
        let newUtxos = await getUnspentsForAddress(address);
        newUtxos = newUtxos.filter(utxo => utxo.value > 546)
            .sort((a, b) => b.value - a.value);

        // Get UTXOs not recently used and enough to cover the requested amount
        const selectedUtxos = await selectValidUtxos(address, newUtxos, requestedAmount);

        // Calculate expiration timestamp
        const expirationTimestamp = Date.now() + UTXO_CACHE_TIME_SECS * 1000;

        // Add expiration timestamp to each UTXO and add them to the queue
        const utxosWithExpiration = selectedUtxos.map(utxo => ({
            ...utxo,
            expiration: expirationTimestamp
        }));
        await addUtxosToQueue(address, utxosWithExpiration);

        res.json(utxosWithExpiration);
    } catch (error) {
        console.error("An error occurred:", error);
        res.status(500).send("Internal Server Error");
    }
});

async function selectValidUtxos(address: string, utxos: IBlockchainInfoUTXO[], amount: number): Promise<IBlockchainInfoUTXO[]> {
    const jobs = await utxoQueue.getJobs(['active', 'delayed', 'waiting']);
    const recentlyUsedUtxos = new Set(jobs.map(job => job.name));
    let selectedUtxos: IBlockchainInfoUTXO[] = [];
    let totalValue = 0;

    console.log("num of utxos in queue", recentlyUsedUtxos.size)

    for (const utxo of utxos) {
        if (totalValue >= amount) break;
        if (!recentlyUsedUtxos.has(`${utxo.tx_hash_big_endian}-${utxo.tx_output_n}`)) {
            selectedUtxos.push(utxo);
            totalValue += utxo.value;
        }
    }

    return selectedUtxos;
}

async function addUtxosToQueue(address: string, utxos: IBlockchainInfoUTXO[]): Promise<void> {
    for (const utxo of utxos) {
        await utxoQueue.add(`${utxo.tx_hash_big_endian}-${utxo.tx_output_n}`, { address, utxo }, {
            removeOnComplete: true,
            delay: UTXO_CACHE_TIME_SECS * 1000 // Delay of 15 seconds
        });
    }
}

async function cleanUpExpiredUtxos(): Promise<void> {
    console.log("cleaning up expired utxos")
    const jobs = await utxoQueue.getJobs(['delayed', 'waiting']);
    const currentTime = Date.now();

    for (const job of jobs) {
        if (currentTime > (job.timestamp + UTXO_CACHE_TIME_SECS * 1000)) {
            await job.remove();
        }
    }
}

// Schedule the cleanup function to run periodically
setInterval(cleanUpExpiredUtxos, UTXO_CACHE_TIME_SECS * 1000); // Run every 60 seconds

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
