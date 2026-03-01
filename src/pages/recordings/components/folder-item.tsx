 import React from 'react';
 import { Folder, MoreVertical } from 'lucide-react';
 import { cn } from '@/lib/utils';
 import { Button } from '@/components/ui/button';
 
 interface FolderItemProps {
   name: string;
   count: number;
   isSelected?: boolean;
   onClick?: () => void;
   onDoubleClick?: () => void;
   viewMode?: 'grid' | 'list';
 }
 
 export const FolderItem: React.FC<FolderItemProps> = ({
   name,
   count,
   isSelected,
   onClick,
   onDoubleClick,
   viewMode = 'grid',
 }) => {
   if (viewMode === 'list') {
     return (
       <div
         className={cn(
           'flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 cursor-pointer border-b transition-colors',
           isSelected && 'bg-zinc-100 hover:bg-zinc-200/50'
         )}
         onClick={onClick}
         onDoubleClick={onDoubleClick}
       >
         <Folder className="w-5 h-5 text-gray-400 fill-gray-400" />
         <span className="flex-1 font-medium text-gray-700 truncate">{name}</span>
         <span className="text-xs text-gray-500 w-24 text-right">{count} items</span>
         <Button variant="ghost" size="icon" className="h-8 w-8">
           <MoreVertical className="w-4 h-4" />
         </Button>
       </div>
     );
   }
 
   return (
     <div
       className={cn(
         'p-4 border rounded-xl flex items-center gap-3 hover:shadow-sm hover:border-zinc-300 cursor-pointer transition-all bg-white group',
         isSelected ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900' : 'border-gray-200'
       )}
       onClick={onClick}
       onDoubleClick={onDoubleClick}
     >
       <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center group-hover:bg-zinc-100 transition-colors">
         <Folder className="w-6 h-6 text-gray-400 fill-gray-400 group-hover:text-zinc-900 group-hover:fill-zinc-900 transition-colors" />
       </div>
       <div className="flex-1 min-w-0">
         <p className="font-semibold text-gray-900 truncate">{name}</p>
         <p className="text-xs text-gray-500">{count} recordings</p>
       </div>
       <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
         <MoreVertical className="w-4 h-4" />
       </Button>
     </div>
   );
 };
