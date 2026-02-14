import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

export const AgentSettingsForm: React.FC = () => {
  return (
    <Card className="w-full max-w-md mx-auto shadow-none border-0 sm:border bg-background">
      <CardHeader>
        <CardTitle>QA Agent Status</CardTitle>
        <CardDescription>
          The agent is connected securely via your GitLab session. No personal
          access token is required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-md border border-green-100">
          <CheckCircle2 className="h-4 w-4" />
          <span>Ready to use</span>
        </div>
      </CardContent>
    </Card>
  );
};
