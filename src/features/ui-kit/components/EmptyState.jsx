import Button from './Button.jsx';

export default function EmptyState({ Icon, message, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-3 py-10 px-4 text-center text-slate-500 ${className}`}>
      {Icon && <span className="w-10 h-10 text-slate-300"><Icon /></span>}
      <p>{message}</p>
      {action && <Button variant="secondary" size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
