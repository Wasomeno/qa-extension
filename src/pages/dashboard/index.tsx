import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatCard } from './components/stat-card';

export const DashboardPage: React.FC = () => {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-8 p-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of your QA activities
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Open Issues" value="12" color="text-blue-600" />
          <StatCard title="Closed Today" value="5" color="text-green-600" />
          <StatCard title="Pinned" value="3" color="text-amber-600" />
          <StatCard title="This Week" value="28" color="text-purple-600" />
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="p-4 bg-gray-50 rounded-xl border border-gray-100"
              >
                <div className="text-sm text-gray-700">
                  Issue #{i * 100 + 23} updated
                </div>
                <div className="text-xs text-gray-400 mt-1">{i} hour ago</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};

export default DashboardPage;
