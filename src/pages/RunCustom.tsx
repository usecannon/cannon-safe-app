import 'react-diff-view/style/index.css'

import _ from 'lodash';

import { Address, Hex, TransactionRequestBase, encodePacked, getFunctionSelector, isAddress, zeroAddress } from 'viem';
import { formatAbiItem } from 'viem/dist/cjs/utils/abi/formatAbiItem'

import {
  Box,
  Button,
  Container,
  EditableInput,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  Text,
  Input,
} from '@chakra-ui/react'
import { ethers } from 'ethers'
import { useEffect, useState } from 'react'
import { useContractWrite, usePrepareSendTransaction, useSendTransaction } from 'wagmi'

import { Transaction } from '../components/Transaction'
import { useTxnStager } from '../hooks/backend'
import { useStore } from '../store'
import { EditableAutocompleteInput } from '../components/EditableAutocompleteInput';
import { useCannonPackageContracts } from '../hooks/cannon';
import { AddIcon, ChevronDownIcon, MinusIcon } from '@chakra-ui/icons';
import { DisplayedTransaction } from '../components/DisplayedTransaction';
import { makeMultisend } from '../utils/multisend';

export function RunCustom() {
  const [target, setTarget] = useState('')
  const [queuedTxns, setQueuedTxns] = useState<Omit<TransactionRequestBase, 'from'>[]>([null]);

  const safeAddress = useStore((s) => s ? s.safeAddress.split(':')[1] : s) as Address

  let toAddress: string | null = null
  if (isAddress(target)) {
    toAddress = target

  }
  const cannonInfo = useCannonPackageContracts(target);

  const multisendTxn = queuedTxns.indexOf(null) === -1 ? makeMultisend(
    [{ to: zeroAddress, data: encodePacked(['string'], [cannonInfo.pkgUrl || '']) } as Partial<TransactionRequestBase>].concat(queuedTxns)
  ) : { value: 0n }

  const stagedTxn = usePrepareSendTransaction({
    account: safeAddress,
    ...multisendTxn,
    value: BigInt(multisendTxn.value)
  })

  // TODO: check types
  const stager = useTxnStager(stagedTxn.data ? {
    to: stagedTxn.data.to,
    value: stagedTxn.data.value.toString(),
    data: stagedTxn.data.data,
    gasPrice: stagedTxn.data?.gasPrice?.toString(),
    safeTxGas: stagedTxn.data?.gas?.toString()
  } : {})

  const execTxn = useContractWrite(stager.executeTxnConfig);

  const funcIsPayable = false;

  function updateQueuedTxn(i: number, txn: Omit<TransactionRequestBase, 'from'>) {
    queuedTxns[i] = txn;
    setQueuedTxns(_.clone(queuedTxns))
  }

  return (
    <Container maxW="100%" w="container.sm">
      <FormControl mb="4">
        <FormLabel>Target</FormLabel>
        <Input type="text" onChange={(event) => setTarget(event.target.value)} />
        <FormHelperText>
          Enter the contract or package for which this transaction should be
          executed. This can either be a Cannon package (in which case, you will
          be prompted to select method, args, etc.), or an address (in which
          case, you will supply with custom data/ABI).
        </FormHelperText>
      </FormControl>

      {cannonInfo.pkgUrl && !cannonInfo.contracts && <Text>Cannon package detected. Loading from IPFS (this may take some time)...</Text>}

      {cannonInfo.contracts && <FormControl mb="4">
        <Heading size="sm">Transactions to Queue</Heading>
        {queuedTxns.map((txn, i) => <DisplayedTransaction contracts={cannonInfo.contracts} onTxn={(txn) => updateQueuedTxn(i, txn)} />)}
        <HStack>
          <Button onClick={() => setQueuedTxns(_.clone(queuedTxns.concat([{}])))}><AddIcon /></Button>
          {queuedTxns.length > 1 && <Button onClick={() => setQueuedTxns(_.clone(queuedTxns.slice(0, queuedTxns.length - 1)))}><MinusIcon /></Button>}
        </HStack>
        <FormHelperText>
          Type a contract name from the cannon package, followed by a function with args to execute. To execute more than one function, click the plus button.
        </FormHelperText>
      </FormControl>}

      {(isAddress(target) || funcIsPayable) && <FormControl mb="4">
        <FormLabel>Value</FormLabel>
        <Input type="text" onChange={(event) => updateQueuedTxn(0, { ...queuedTxns[0], value: BigInt(event.target.value) })} />
        <FormHelperText>
          Amount of ETH to send as part of transaction
        </FormHelperText>
      </FormControl>}
      

      {isAddress(target) && <FormControl mb="4">
        <FormLabel>Transaction Data</FormLabel>
        <Input type="text" placeholder='0x' onChange={(event) => updateQueuedTxn(0, { ...queuedTxns[0], data: event.target.value as Hex || '0x' })} />
        <FormHelperText>
          0x prefixed hex code data to send with transaction
        </FormHelperText>
      </FormControl>}

      {/* todo: nonce override */}

      {(cannonInfo.contracts || isAddress(target)) && <Box mb="6">
        <HStack>
          <Button
            w="100%"
            isDisabled={!stagedTxn.data || !stager.canSign}
            onClick={() => stager.sign()}
          >
            Sign
          </Button>
          <Button
            w="100%"
            isDisabled={!stagedTxn.data || !stager.canExecute}
            onClick={() => execTxn.write()}
          >
            Execute
          </Button>
        </HStack>
        {stagedTxn.isError && <Text>Transaction Error: {stagedTxn.error.message}</Text>}
      </Box>}
    </Container>
  )
}
