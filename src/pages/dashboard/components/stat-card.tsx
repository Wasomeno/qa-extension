import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  color: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, color }) => (
  <div className="p-5 bg-gray-50 rounded-xl border border-gray-100">
    <div className={cn('text-3xl font-bold', color)}>{value}</div>
    <div className="text-xs text-gray-500 mt-1">{title}</div>
  </div>
);
