import { joinClassNames } from '@/lib/joinClassNames'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'ghost'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  children: ReactNode
}

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={joinClassNames(styles.button, className)}
      data-variant={variant}
      {...rest}
    >
      {children}
    </button>
  )
}
