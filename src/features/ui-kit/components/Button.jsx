import Icons from '../../../components/Icons.jsx';

const VARIANTS = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 border-transparent',
};
const SIZES = { sm: 'px-3 py-1.5 text-sm min-h-[44px]', md: 'px-4 py-2 min-h-[44px]', lg: 'px-5 py-3 text-lg min-h-[48px]' };

export const buttonClass = (variant = 'primary', size = 'md', extra = '') =>
  `inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${extra}`;

/** variant: primary|secondary|ghost|danger; size: sm|md|lg (all >= 44px tall); loading shows a spinner and disables. */
export default function Button({ variant = 'primary', size = 'md', loading = false, Icon, children, className = '', disabled, type = 'button', ...rest }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {(loading || Icon) && <span className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}>{loading ? <Icons.Refresh /> : <Icon />}</span>}
      {children}
    </button>
  );
}
