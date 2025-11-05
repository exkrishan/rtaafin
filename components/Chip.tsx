'use client';

export interface ChipProps {
  label: string;
  variant?: 'default' | 'relevance';
  className?: string;
}

export default function Chip({ label, variant = 'default', className = '' }: ChipProps) {
  const baseClasses = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
  
  const variantClasses = {
    default: 'bg-gray-100 text-gray-700',
    relevance: 'bg-[#16A34A] text-white',
  };

  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {label}
    </span>
  );
}

