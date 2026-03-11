import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

import { SingleIssueTab } from './components/single-issue-tab';
import { IssueWithChildTab } from './components/issue-with-child-tab';

interface CreateIssuePageProps {
  portalContainer?: HTMLElement | null;
}

export const CreateIssuePage: React.FC<CreateIssuePageProps> = ({
  portalContainer,
}) => {
  return (
    <ScrollArea className="h-full">
      <div className="p-8 pb-32">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Create Issue</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full p-0 text-gray-400 hover:text-gray-600"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs" container={portalContainer}>
                  <p>
                    Capture and document software defects or request new features.
                    Integrates directly with your project's tracking system for seamless reporting.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Report a new bug or quality issue
          </p>
        </div>

        <Tabs defaultValue="issue" className="w-full">
          <TabsList className="mb-6" variant="line">
            <TabsTrigger value="issue" variant="line">Issue</TabsTrigger>
            <TabsTrigger value="child" variant="line">Issue with Child</TabsTrigger>
            <TabsTrigger value="ac" variant="line" disabled>
              From Acceptance Criteria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issue" className="mt-0">
            <SingleIssueTab portalContainer={portalContainer} />
          </TabsContent>

          <TabsContent value="child" className="mt-0">
            <IssueWithChildTab portalContainer={portalContainer} />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
};

export default CreateIssuePage;
