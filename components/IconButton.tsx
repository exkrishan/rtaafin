'use client';

import { ReactNode } from 'react';

export interface IconButtonProps {
  icon: ReactNode;
  onClick: () => void;
  label: string;
  variant?: 'default' | 'active' | 'hover';
  ariaLabel?: string;
}

export default function IconButton({
  icon,
  onClick,
  label,
  variant = 'default',
  ariaLabel,
}: IconButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
  
  const variantClasses = {
    default: 'text-gray-600 hover:bg-[#F2F5FF]',
    active: 'text-blue-600 bg-[#F2F5FF]',
    hover: 'text-gray-600 hover:bg-[#F2F5FF]',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]}`}
      aria-label={ariaLabel || label}
      title={label}
    >
      {icon}
    </button>
  );
}

