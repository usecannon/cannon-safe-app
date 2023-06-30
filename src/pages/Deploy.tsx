import _ from 'lodash'

import 'react-diff-view/style/index.css'

import {
  Box,
  Button,
  Container,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  Input,
  Select,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useColorMode,
} from '@chakra-ui/react'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import {
  Hex,
  TransactionRequestBase,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  padHex,
  stringToBytes,
  stringToHex,
  toBytes,
  toHex,
  trim,
  zeroAddress,
} from 'viem'
import {
  useContractRead,
  useContractWrite,
  useFeeData,
  usePrepareSendTransaction,
  useSendTransaction,
} from 'wagmi'
import { useEffect, useState } from 'react'

import * as onchainStore from '../utils/onchain-store'
import { EditableAutocompleteInput } from '../components/EditableAutocompleteInput'
import { useCannonBuild, useCannonPackage, useCannonWriteDeployToIpfs, useLoadCannonDefinition } from '../hooks/cannon'
import { useGitDiff, useGitFilesList, useGitRefsList } from '../hooks/git'
import { useStore } from '../store'
import { useTxnStager } from '../hooks/backend'
import { makeMultisend } from '../utils/multisend'
import { SafeTransaction } from '../types'
import { useNavigate } from 'react-router-dom'
import { TransactionDisplay } from '../components/TransactionDisplay'
import { ChainBuilderContext, createInitialContext } from '@usecannon/builder'

export function Deploy() {
  const { colorMode } = useColorMode()
  const currentSafe = useStore((s) => s.currentSafe)

  const prepareDeployOnchainStore = usePrepareSendTransaction(
    onchainStore.deployTxn
  )
  const deployOnchainStore = useSendTransaction({
    ...prepareDeployOnchainStore.config,
    onSuccess: () => {
      console.log('on success')
      prepareDeployOnchainStore.refetch()
    },
  })

  const [gitUrl, setGitUrl] = useState('')
  const [gitFile, setGitFile] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [partialDeployIpfs, setPartialDeployIpfs] = useState('')

  const gitDir = gitFile.includes('/')
    ? gitFile.slice(gitFile.lastIndexOf('/'))[0]
    : ''

  const refsInfo = useGitRefsList(gitUrl)

  const navigate = useNavigate()

  if (refsInfo.refs && !gitBranch) {
    const headCommit = refsInfo.refs.find((r) => r.ref === 'HEAD')
    const headBranch = refsInfo.refs.find(
      (r) => r.oid === headCommit?.oid && r !== headCommit
    )

    if (headBranch) {
      setGitBranch(headBranch.ref)
    }
  }

  const gitDirList = useGitFilesList(gitUrl, gitBranch, gitDir)

  const cannonDefInfo = useLoadCannonDefinition(gitUrl, gitBranch, gitFile)

  // TODO: is there any way to make a better ocntext? maybe this means we should get rid of name using context?
  const ctx: ChainBuilderContext = {
    chainId: 0,

    package: {},

    timestamp: '0',

    settings: {},

    contracts: {},

    txns: {},

    imports: {},

    extras: {},
  };

  const cannonPkgLatestInfo = useCannonPackage(cannonDefInfo.def && `${cannonDefInfo.def.getName(ctx)}:latest`)
  const cannonPkgVersionInfo = useCannonPackage(cannonDefInfo.def && `${cannonDefInfo.def.getName(ctx)}:${cannonDefInfo.def.getVersion(ctx)}`)

  const prevDeployLocation = 
    (partialDeployIpfs ? 'ipfs://' + partialDeployIpfs : null) || 
    cannonPkgLatestInfo.pkgUrl || 
    cannonPkgVersionInfo.pkgUrl;
  
  const prevCannonDeployInfo = useCannonPackage(prevDeployLocation ? `@ipfs:${_.last(prevDeployLocation.split('/'))}` : null)

  // run the build and get the list of transactions we need to run
  const buildInfo = useCannonBuild(
    cannonDefInfo.def,
    prevCannonDeployInfo.pkg
  )

  const uploadToPublishIpfs = useCannonWriteDeployToIpfs(buildInfo.buildResult?.runtime, {
    def: cannonDefInfo.def?.toJson(),
    state: buildInfo.buildResult?.state,
    options: prevCannonDeployInfo.pkg?.options,
    meta: prevCannonDeployInfo.pkg?.meta,
    miscUrl: prevCannonDeployInfo.pkg?.miscUrl,
  }, prevCannonDeployInfo.metaUrl)

  console.log('WRITE IPFS RES', uploadToPublishIpfs.writeToIpfsMutation.data || uploadToPublishIpfs.writeToIpfsMutation.error)

  useEffect(() => {
    if (buildInfo.buildResult) {
      console.log('HAVE BUILD RESULT. SENDING TO IPFS!')
      uploadToPublishIpfs.writeToIpfsMutation.mutate()
    }
  }, [buildInfo.buildResult?.steps]);

  const gitHash = refsInfo.refs?.find(r => r.ref === gitBranch)?.oid;

  const multicallTxn: /*Partial<TransactionRequestBase>*/ any =
    buildInfo.buildResult &&
    buildInfo.buildResult.steps.indexOf(null) === -1
      ? makeMultisend(
          [
            // supply the hint data
            {
              to: zeroAddress,
              data: encodeAbiParameters([{ type: 'string[]'}], [[
                'deploy', 
                uploadToPublishIpfs.deployedIpfsHash,
                `${gitUrl}:${gitFile}`,
                gitHash
              ]
            ]),
            } as Partial<TransactionRequestBase>,
            // write data needed for the subsequent deployment to chain
            {
              to: onchainStore.deployAddress,
              data: encodeFunctionData({ abi: onchainStore.ABI, functionName: 'set', args: [
                keccak256(toBytes(`${gitUrl}:${gitFile}`)),
                padHex('0x' + gitHash as Hex, { dir: 'right', size: 32 })
              ] }),
            } as Partial<TransactionRequestBase>,
          ].concat(
            buildInfo.buildResult.steps.map(
              (s) => s.tx as unknown as Partial<TransactionRequestBase>
            )
          )
        )
      : { value: 0n }

  let totalGas = 0n

  for (const step of buildInfo.buildResult?.steps || []) {
    totalGas += BigInt(step.gas.toString())
  }

  const stager = useTxnStager(
    multicallTxn.data
      ? {
          to: multicallTxn.to,
          value: multicallTxn.value.toString(),
          data: multicallTxn.data,
          safeTxGas: totalGas.toString(),
          operation: '1', // delegate call multicall
        }
      : {},
    {
      onSignComplete() {
        console.log('signing is complete, redirect')
        navigate('/')
      },
    }
  )

  const execTxn = useContractWrite(stager.executeTxnConfig)

  if (
    prepareDeployOnchainStore.isFetched &&
    !prepareDeployOnchainStore.isError
  ) {
    return (
      <Container maxW="100%" w="container.sm">
        <Text mb="8">
          If your protocol is managed using a GitOps repository (with
          cannonfiles on GitHub), you can use this tool to queue transactions
          that would be created by merging the branch you specify.
        </Text>
        <Box
          p="6"
          bg={colorMode === 'dark' ? 'blackAlpha.400' : 'blackAlpha.50'}
          borderRadius="12px"
        >
          <Text mb={4}>
            To use this tool, you need to deploy the on-chain store contract.
            This is a one time (per network) operation and will cost a small
            amount of gas.
          </Text>
          <Button w="100%" onClick={() => deployOnchainStore.sendTransaction()}>
            Deploy On-Chain Store Contract
          </Button>
        </Box>
      </Container>
    )
  }

  return (
    <Container maxW="100%" w="container.sm">
      <FormControl mb="4">
        <FormLabel>Git Repo URL</FormLabel>
        <HStack>
          <Input
            type="text"
            placeholder="https://github.com/myorg/myrepo"
            value={gitUrl}
            onChange={(evt) => setGitUrl(evt.target.value)}
          />
          <EditableAutocompleteInput
            editable
            color="black"
            placeholder="cannonfile.toml"
            items={(gitDirList.contents || []).map((d) => ({
              label: gitDir + d,
              secondary: '',
            }))}
            onFilterChange={(v) => setGitFile(v)}
            onChange={(v) => setGitFile(v)}
          />
        </HStack>
        <FormHelperText>
          Enter the GitHub URL for branch of the GitOps repository to deploy.
          You will able to execute the transactions you are permitted to and
          queue the rest.
        </FormHelperText>
      </FormControl>

      <FormControl mb="4">
        <FormLabel>Branch</FormLabel>
        <HStack>
          <Select
            value={gitBranch}
            onChange={(evt) => setGitBranch(evt.target.value)}
          >
            {(refsInfo.refs?.filter((r) => r.ref !== 'HEAD') || []).map((r) => (
              <option value={r.ref}>{r.ref}</option>
            ))}
          </Select>
        </HStack>
        <FormHelperText>
          If you don't want to deploy from the default branch. Cannon will
          automatically detect the previous release.
        </FormHelperText>
      </FormControl>

      {/* TODO: insert/load override settings here */}

      <FormControl mb="4">
        <FormLabel>Optional Partial Deploy</FormLabel>
        <Input
          type="text"
          value={partialDeployIpfs}
          onChange={
            (evt) =>
              setPartialDeployIpfs(
                evt.target.value.slice(evt.target.value.indexOf('Qm'))
              ) /** TODO: handle bafy hash or other hashes */
          }
        />
        <FormHelperText>
          If the deployment you are executing required executing some
          transactions outside the safe (ex. contract deployments, transactions
          requiring permission of EOA), please supply the IPFS hash here.
        </FormHelperText>
      </FormControl>

      {buildInfo.buildStatus && (
        <Box mb="6">{buildInfo.buildStatus}</Box>
      )}

      {buildInfo.buildError && (
        <Box mb="6">{buildInfo.buildError}</Box>
      )}

      {multicallTxn.data && stager.safeTxn && <TransactionDisplay safeAddress={currentSafe.address} safeTxn={stager.safeTxn} />}

      <Box mb="6">
        <HStack>
          <Button
            w="100%"
            isDisabled={!uploadToPublishIpfs.deployedIpfsHash || !multicallTxn.data || !stager.canSign}
            onClick={() => stager.sign()}
          >
            Sign
          </Button>
          <Button
            w="100%"
            isDisabled={!uploadToPublishIpfs.deployedIpfsHash || !multicallTxn.data || !stager.canExecute}
            onClick={() => execTxn.write()}
          >
            Execute
          </Button>
        </HStack>
      </Box>
    </Container>
  )
}
