import { clsx } from 'clsx'
import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 font-medium rounded-lg transition-colors cursor-pointer',
        {
          'bg-orange-500 hover:bg-orange-600 text-white': variant === 'primary',
          'hover:bg-gray-100 text-gray-600': variant === 'ghost',
          'border border-gray-300 hover:bg-gray-50 text-gray-700': variant === 'outline',
          'px-4 py-2 text-sm': size === 'md',
          'px-3 py-1.5 text-xs': size === 'sm',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
