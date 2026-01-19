import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
          <h1 className="text-2xl font-bold text-gray-900">Create Issue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Report a new bug or quality issue
          </p>
        </div>

        <Tabs defaultValue="issue" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="issue">Issue</TabsTrigger>
            <TabsTrigger value="child">Issue with Child</TabsTrigger>
            <TabsTrigger value="ac" disabled>
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
