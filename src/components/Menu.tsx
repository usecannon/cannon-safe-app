import {
  Box,
  Flex,
  HStack,
  IconButton,
  Text,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { MoonIcon, SunIcon } from '@chakra-ui/icons'
import { NavLink } from 'react-router-dom'

import { useStore } from '../store'

const pages = [
  { to: '/', title: 'Transaction Queue' },
  { to: '/transactions', title: 'Queue Transactions' },
  { to: '/gitops-diffs', title: 'Queue GitOps Diffs' },
  { to: '/settings', title: 'Settings' },
] as const

function NavItem({ to, title }: { to: string; title: string }) {
  const currentSafe = useStore((s) => s.currentSafe)
  const activeColor = useColorModeValue('blue.600', 'blue.300')
  const hoverColor = useColorModeValue('gray.400', 'whiteAlpha.700')

  const link =
    currentSafe && to !== '/settings'
      ? `${to}?chainId=${currentSafe.chainId}&address=${currentSafe.address}`
      : to

  return (
    <NavLink to={link}>
      {({ isActive }) => (
        <Text
          fontWeight="semibold"
          mx="4"
          color={isActive && activeColor}
          _hover={!isActive && { color: hoverColor }}
        >
          {title}
        </Text>
      )}
    </NavLink>
  )
}

export function Menu() {
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <>
      <Box
        p={4}
        bg={colorMode === 'dark' ? 'blackAlpha.400' : 'blackAlpha.100'}
      >
        <Flex display="flex" justifyContent="space-between">
          <Text fontSize="26.5px" fontWeight="semibold">
            Cannon Deployer
          </Text>
          <Flex>
            <ConnectButton />
            <IconButton
              ml="3"
              variant={'ghost'}
              aria-label="color mode"
              icon={colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
              onClick={toggleColorMode}
            />
          </Flex>
        </Flex>
      </Box>
      <Flex
        bg={colorMode === 'dark' ? 'blackAlpha.500' : 'blackAlpha.200'}
        p="3"
        mb="6"
        borderTop="1px solid"
        borderBottom="1px solid"
        borderTopColor={
          colorMode === 'dark' ? 'whiteAlpha.100' : 'blackAlpha.50'
        }
        borderBottomColor={
          colorMode === 'dark' ? 'whiteAlpha.200' : 'blackAlpha.50'
        }
      >
        <HStack mx="auto">
          {pages.map((info) => (
            <NavItem key={info.title} to={info.to} title={info.title} />
          ))}
        </HStack>
      </Flex>
    </>
  )
}
