import { Children, useState } from 'react'
import { Container } from '@nextui-org/react'

import { Menu } from './Menu'

interface ItemProps {
  title: string
  children?: React.ReactNode | React.ReactNode[]
}

interface Props {
  children?: React.ReactElement<ItemProps> | React.ReactElement<ItemProps>[]
}

export function Layout({ children }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const menuItems = Children.map(children, (child) => ({
    title: child.props.title,
  }))

  return (
    <>
      <Menu
        items={menuItems}
        value={currentIndex}
        onChange={(index) => setCurrentIndex(index)}
      />
      <Container xs>
        {Children.count(children) > 0 &&
          Children.toArray(children)[currentIndex]}
      </Container>
    </>
  )
}

export function View({ children }: ItemProps) {
  return <>{children}</>
}
