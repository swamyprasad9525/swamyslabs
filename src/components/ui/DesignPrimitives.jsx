import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export function Container({ as: Tag = 'div', size = 'standard', className, children }) {
  return (
    <Tag className={cn('site-container', size === 'wide' && 'site-container--wide', size === 'narrow' && 'site-container--narrow', className)}>
      {children}
    </Tag>
  );
}

export function Section({ as: Tag = 'section', tone = 'light', className, children, ...props }) {
  return (
    <Tag className={cn('section-space', tone === 'dark' && 'bg-[var(--color-ink)] text-[var(--color-text-inverse)]', tone === 'muted' && 'bg-[var(--color-surface-muted)]', className)} {...props}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className }) {
  return <p className={cn('type-eyebrow text-[var(--color-brand)]', className)}>{children}</p>;
}

export function SectionHeader({ eyebrow, title, copy, align = 'left', inverse = false, className }) {
  return (
    <div className={cn('max-w-3xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className={cn('type-display-md mt-4 text-[var(--color-text-primary)]', inverse && 'text-white')}>{title}</h2>
      {copy && <p className={cn('type-body-lg mt-5 text-[var(--color-text-secondary)]', inverse && 'text-stone-300')}>{copy}</p>}
    </div>
  );
}

const actionStyles = {
  primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] border-[var(--color-brand)]',
  secondary: 'bg-transparent text-current border-current hover:bg-stone-900 hover:text-white',
  inverse: 'bg-white text-stone-950 border-white hover:bg-stone-200',
  text: 'border-transparent px-0 text-current hover:text-[var(--color-brand)]',
};

export function ActionLink({ to, href, variant = 'primary', className, children, ...props }) {
  const classes = cn('action-link', actionStyles[variant], className);
  if (to) return <Link to={to} className={classes} {...props}>{children}</Link>;
  return <a href={href} className={classes} {...props}>{children}</a>;
}

export function Reveal({ children, className, delay = 0 }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
