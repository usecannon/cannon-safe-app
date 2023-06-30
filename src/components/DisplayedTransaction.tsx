import _ from 'lodash'
import {
  Address,
  Hex,
  TransactionRequestBase,
  decodeFunctionData,
  encodeFunctionData,
  getFunctionSelector,
  hexToString,
  stringToHex,
  trim,
} from 'viem'
import {
  Box,
  Editable,
  EditableInput,
  EditablePreview,
  HStack,
  Popover,
  PopoverAnchor,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useAccount } from 'wagmi'
import { useState } from 'react'

import { EditableAutocompleteInput } from './EditableAutocompleteInput'
import { useStore } from '../store'

export function DisplayedTransaction(props: {
  contracts: { [key: string]: { address: Address; abi: any[] } }
  txn?: Omit<TransactionRequestBase, 'from'>
  onTxn?: (txn: Omit<TransactionRequestBase, 'from'> | null) => void
  editable?: boolean
}) {
  const currentSafe = useStore((s) => s.currentSafe)
  const account = useAccount()

  const parsedContractNames = props.txn
    ? Object.entries(props.contracts)
        .filter((c) => c[1].address === props.txn.to)
        .map((v) => v[0])
    : ''

  let parsedContract = props.txn ? props.txn.to : ''
  let parsedFunction = null
  for (const n of parsedContractNames) {
    try {
      parsedFunction = decodeFunctionData({
        abi: props.contracts[n].abi,
        data: props.txn.data,
      })
      parsedContract = n
      break
    } catch {
      // ignore
    }
  }

  const [execContract, setExecContract] = useState(parsedContract)
  const [execFunc, setExecFunc] = useState(
    props.txn
      ? parsedFunction
        ? parsedFunction.functionName.split('(')[0]
        : props.txn.data.slice(0, 10)
      : ''
  )
  const [execFuncArgs, setExecFuncArgs] = useState(
    props.txn
      ? parsedFunction?.args?.map((v) => v.toString()) || [
          props.txn.data.slice(10),
        ]
      : []
  )

  const execContractInfo = execContract ? props.contracts[execContract] : null
  const execFuncFragment =
    execContractInfo && execFunc
      ? execContractInfo.abi.find((f) => f.name === execFunc)
      : null

  function selectExecFunc(label: string) {
    if (execFunc !== label) {
      setExecFunc(label)

      const abiFragment = execContractInfo.abi.find((f) => f.name === label)

      if (props.onTxn) {
        if (!abiFragment.inputs.length) {
          // transaction is valid
          props.onTxn({
            to: execContractInfo.address,
            data: getFunctionSelector(abiFragment),
          })
        } else {
          props.onTxn(null)
        }
      }
    }
  }

  function encodeArg(type: string, val: string) {
    if (type.startsWith('bytes') && !val.startsWith('0x')) {
      return stringToHex(val || '', { size: 32 })
    }
    if (type == 'bool') {
      return val === 'true' ? true : false
    } else {
      return val
    }
  }

  function decodeArg(type: string, val: string) {
    if (type.startsWith('bytes') && val.startsWith('0x')) {
      try {
        return hexToString(trim(val as Hex, { dir: 'right' }))
      } catch (err) {
        console.warn('could not decode hex', err)
        return val
      }
    } else if (type == 'bool') {
      return val ? 'true' : 'false'
    } else {
      return val
    }
  }

  function updateFuncArg(arg: number, val: string) {
    try {
      while (execFuncArgs.length < execFuncFragment.inputs.length) {
        execFuncArgs.push('')
      }

      while (execFuncArgs.length > execFuncFragment.inputs.length) {
        execFuncArgs.pop()
      }

      execFuncArgs[arg] = encodeArg(execFuncFragment.inputs[arg].type, val)

      setExecFuncArgs(_.clone(execFuncArgs))

      if (props.onTxn && !execFuncArgs.find((a) => a === '')) {
        // we have a valid transaction
        props.onTxn({
          to: execContractInfo.address,
          data: encodeFunctionData({
            abi: [execFuncFragment],
            args: execFuncArgs,
          }),
        })
      }
    } catch (err) {
      console.log('arg handle fail', err)
    }
  }

  function generateArgOptions(arg: number) {
    if (execFuncFragment.inputs.length > arg) {
      if (
        execFuncFragment.inputs[arg].type.startsWith('uint') ||
        execFuncFragment.inputs[arg].type.startsWith('int')
      ) {
        // offer both the nubmer they are typing, and also the bigint version
        const num = execFuncArgs[arg] || '0'
        return [
          { label: num, secondary: 'literal' },
          { label: num + '000000000000000000', secondary: '18-decimal fixed' },
        ]
      }

      switch (execFuncFragment.inputs[arg].type) {
        case 'bool':
          return [
            { label: 'true', secondary: '' },
            { label: 'false', secondary: '' },
          ]
        case 'address':
          return [
            { label: execFuncArgs[arg] || '', secondary: '' },
            { label: currentSafe?.address ?? '', secondary: 'Safe Address' },
            { label: account.address, secondary: 'Your Address' },
            ...Object.entries(props.contracts).map(([l, c]) => ({
              label: c.address,
              secondary: l,
            })),
          ]
        default: // bytes32, string
          return [
            {
              label:
                decodeArg(
                  execFuncFragment.inputs[arg].type,
                  execFuncArgs[arg] || ''
                ) || '',
              secondary: '',
            },
          ]
      }
    }

    return []
    //const input =
  }

  function extractFunctionNames(contractAbi: any[]) {
    return contractAbi
      .filter((a) => a.type === 'function' && a.stateMutability !== 'view')
      .map((a) => {
        return { label: a.name, secondary: getFunctionSelector(a) }
      })
  }

  return (
    <HStack fontFamily={'monospace'} gap={0} fontSize={24}>
      <EditableAutocompleteInput
        color="gray.200"
        defaultValue={execContract}
        tabKeys="."
        placeholder="Contract"
        items={Object.entries(props.contracts).map(([k, v]) => ({
          label: k,
          secondary: v.address,
        }))}
        onChange={(item) => setExecContract(item)}
        editable={props.editable}
      />
      <Text>.</Text>
      <EditableAutocompleteInput
        color="gray.200"
        defaultValue={execFunc}
        tabKeys="("
        placeholder="func"
        items={
          execContractInfo ? extractFunctionNames(execContractInfo.abi) : []
        }
        onChange={selectExecFunc}
        onPending={selectExecFunc}
        editable={props.editable}
      />
      <Text>(</Text>
      {(execFuncFragment?.inputs || []).map((arg, i) => [
        <EditableAutocompleteInput
          color="gray.200"
          defaultValue={execFuncArgs[i]}
          tabKeys=","
          placeholder={arg.name || arg.type || arg.internalType}
          items={generateArgOptions(i)}
          onFilterChange={(v) => {
            console.log('update filter change')
            updateFuncArg(i, v)
          }}
          onChange={(v) => console.log('on change', updateFuncArg(i, v))}
          editable={props.editable}
        />,
        <Text>{i < execFuncFragment.inputs.length - 1 ? ',' : ''}</Text>,
      ])}
      <Text>)</Text>
    </HStack>
  )
}
