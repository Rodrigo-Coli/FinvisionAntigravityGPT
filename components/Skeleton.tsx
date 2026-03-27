import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle' | 'text';
}

const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect' }) => {
  const baseClass = "animate-pulse bg-slate-200/60 dark:bg-slate-800/50";
  const variantClass = variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded-md h-4' : 'rounded-3xl';
  
  return <div className={`${baseClass} ${variantClass} ${className}`} />;
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-8 space-y-8 animate-in fade-in duration-500">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="w-32 h-8" />
          <Skeleton className="w-48 h-4" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <Skeleton className="w-24 h-12 rounded-xl" />
        </div>
      </div>

      {/* Main Balance Card Skeleton */}
      <Skeleton className="w-full h-64 rounded-[40px]" />

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex justify-between items-center">
             <Skeleton className="w-40 h-6" />
             <Skeleton className="w-20 h-4" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Skeleton className="h-40 rounded-[32px]" />
             <Skeleton className="h-40 rounded-[32px]" />
          </div>
          <Skeleton className="w-full h-80 rounded-[40px]" />
        </div>
        <div className="lg:col-span-4">
           <Skeleton className="w-full h-[600px] rounded-[40px]" />
        </div>
      </div>
    </div>
  );
};

export default Skeleton;
