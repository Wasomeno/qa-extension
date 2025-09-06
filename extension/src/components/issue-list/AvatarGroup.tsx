import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/src/components/ui/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/src/components/ui/ui/tooltip';

export type AvatarUser = {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
};

interface AvatarGroupProps {
  users: AvatarUser[];
  size?: number; // pixel size, defaults to 24
  className?: string;
}

const getInitials = (name?: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts[1]?.[0] ?? '';
  return (first + last).toUpperCase() || first.toUpperCase();
};

const AvatarGroup: React.FC<AvatarGroupProps> = ({ users, size = 24, className }) => {
  if (!users || users.length === 0) return null;

  const dimension = `${size}px`;

  return (
    <TooltipProvider>
      <div className={`flex -space-x-2 ${className ?? ''}`}>
        {users.map(u => (
          <Tooltip key={u.id}>
            <TooltipTrigger asChild>
              <div className="relative" title={u.name || u.username}>
                <Avatar
                  className="ring-2 ring-white shadow-sm transition-transform hover:-translate-x-0.5 hover:z-10"
                  style={{ width: dimension, height: dimension }}
                >
                  <AvatarImage src={u.avatarUrl} alt={u.name} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(u.name || u.username)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{u.name || u.username}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

export default AvatarGroup;
