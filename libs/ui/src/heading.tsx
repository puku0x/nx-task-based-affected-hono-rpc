import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export function Heading({ children }: Props) {
  return <h1 style={{ fontSize: '1.5rem' }}>{children}</h1>;
}
