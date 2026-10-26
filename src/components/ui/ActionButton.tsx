import { Button, type ButtonProps } from 'antd'
import { Link, type LinkProps } from 'react-router-dom'

type ButtonTone = 'dark' | 'quiet' | 'lime' | 'danger'

type ActionButtonProps = Omit<ButtonProps, 'className'> & {
  className?: string
  tone?: ButtonTone
}

type ActionLinkProps = Omit<LinkProps, 'className'> & {
  className?: string
  tone?: ButtonTone
}

function getButtonClassName(tone: ButtonTone, className?: string) {
  return ['button', `button-${tone}`, 'action-button', 'action-motion', className]
    .filter(Boolean)
    .join(' ')
}

export function ActionButton({
  className,
  danger,
  type,
  tone = 'dark',
  ...props
}: ActionButtonProps) {
  return (
    <Button
      {...props}
      danger={danger || tone === 'danger'}
      type={type ?? (tone === 'dark' ? 'primary' : 'default')}
      className={getButtonClassName(tone, className)}
    />
  )
}

export function ActionLink({
  className,
  tone = 'dark',
  ...props
}: ActionLinkProps) {
  return (
    <Link
      {...props}
      className={getButtonClassName(tone, className)}
    />
  )
}
