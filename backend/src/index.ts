import express from 'express';
import morgan from 'morgan';
import { ethers } from 'ethers';

const SafeABI = require('./abi/Safe.json');

type SafeTransaction = {
    to: string;
    value: string;
    data: string;
    operation: string;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
};

type StagedTransaction = {
    nonce: number;
    txn: SafeTransaction;
    sigs: string[];
}

async function start() {
    const txdb = new Map<string, StagedTransaction[]>();

    const providers = new Map<bigint, ethers.Provider>();
    
    for (const rpcUrl of process.env.RPC_URLS?.split(',') || []) {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const networkInfo = await provider.getNetwork();
        providers.set(networkInfo.chainId, provider);
    }
    
    function getSafeKey(chainId: number, safeAddress: string) {
        return `${chainId}-${safeAddress.toLowerCase()}`;
    }
    
    const app = express();

    app.use(morgan('tiny'));
    
    app.get('/:chainId/:safeAddress', async (req, res) => {
        res.send(txdb.get(getSafeKey(parseInt(req.params.chainId), req.params.safeAddress)) || []);
    });
    
    app.post('/:chainId/:safeAddress', async (req, res) => {
    
        const signedTransactionInfo: StagedTransaction = JSON.parse(req.body);
        
        const chainId = parseInt(req.params.chainId);
    
        const provider = providers.get(BigInt(chainId));
    
        if (!provider) {
            return res.status(400).send('chain id not supported');
        }
    
        const safe = new ethers.Contract(req.params.safeAddress, SafeABI, provider);
    
        const txs = txdb.get(getSafeKey(chainId, req.params.safeAddress)) || [];
    
        const existingTx = 
            txs.find(tx => JSON.stringify(tx.txn) == JSON.stringify(signedTransactionInfo));
    
        if (!existingTx) {
            // verify the new txn will work on what we know about the safe right now
            const currentNonce: bigint = await safe.nonce();
    
            if (signedTransactionInfo.nonce < currentNonce) {
                return res.status(400).send('proposed nonce is lower than current safe nonce');
            }
    
            if (
                signedTransactionInfo.nonce > currentNonce && 
                !txs.find(tx => tx.nonce === signedTransactionInfo.nonce - 1)
            ) {
                return res.status(400).send('proposed nonce is higher than current safe nonce with missing staged');
            }
        } else {
            // verify that new signers list is longer than old signers list
            if (existingTx.sigs.length >= signedTransactionInfo.sigs.length) {
                return res.status(400).send('new sigs count must be greater than old sigs count');
            }
    
        }
    
        // verify all sigs are valid
        const hashData = await safe.encodeTransactionData(signedTransactionInfo.txn);
    
        try {
            await safe.checkNSignatures(ethers.keccak256(hashData), hashData, ethers.concat(signedTransactionInfo.sigs), signedTransactionInfo.sigs.length);
        } catch (err) {
            return res.status(400).send('invalid signature');
        }
    
        txs.push(signedTransactionInfo);
        txdb.set(getSafeKey(chainId, req.params.safeAddress), txs);
    
        res.send(txs);
    });
    
    app.listen(parseInt(process.env.PORT || '3000'), () => {
        console.log('started');
        console.log('registered networks:', Array.from(providers.keys()).join(' '));
    });
}

start();