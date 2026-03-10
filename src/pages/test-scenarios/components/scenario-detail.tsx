import React, { useState } from 'react';
import {
  X,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TestScenario } from '@/types/test-scenario';

interface ScenarioDetailProps {
  scenario: TestScenario;
  projectName?: string;
  onClose: () => void;
  onGenerate: (sheets: string[]) => void;
  onDelete: () => void;
  onViewGeneratedId: (id: string) => void;
}

export const ScenarioDetail: React.FC<ScenarioDetailProps> = ({
  scenario,
  projectName,
  onClose,
  onGenerate,
  onDelete,
  onViewGeneratedId,
}) => {
  const [isSelectingSheets, setIsSelectingSheets] = useState(false);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);

  const handleStartGenerationClick = () => {
    if (isSelectingSheets) {
      if (selectedSheets.length > 0) {
        onGenerate(selectedSheets);
        setIsSelectingSheets(false);
      }
    } else {
      setIsSelectingSheets(true);
    }
  };

  const totalTestCases = (scenario.sheets || []).reduce(
    (acc, sheet) => acc + (sheet.testCases?.length || 0),
    0
  );

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0 bg-white z-10">
        <div className="flex items-center gap-2 min-w-0">
          {isSelectingSheets && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSelectingSheets(false)}
              className="h-8 w-8 -ml-1 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <h2
            className="text-lg font-semibold truncate"
            title={scenario.fileName}
          >
            {isSelectingSheets ? 'Select Sheets' : scenario.fileName}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-zinc-500"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} mode="wait">
          {!isSelectingSheets ? (
            <motion.div
              key="summary"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col w-full overflow-hidden"
            >
              <ScrollArea className="flex-1 w-full">
                <div className="p-6 space-y-6 w-full max-w-[480px]">
                  {/* Status Section */}
                  <div className="space-y-4 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-900 border-b pb-2">
                      Status
                    </h3>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-500">Current Phase</span>
                      <span className="font-medium capitalize">
                        {scenario.status}
                      </span>
                    </div>
                    {scenario.error && (
                      <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-2 max-w-full">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="break-words min-w-0">
                          {scenario.error}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm min-w-0">
                      <span className="text-zinc-500 shrink-0">
                        Target Project
                      </span>
                      <span
                        className="font-medium text-zinc-900 truncate ml-4 min-w-0"
                        title={
                          scenario.projectName ||
                          projectName ||
                          'Unassigned Project'
                        }
                      >
                        {scenario.projectName || projectName || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {/* Test Cases Overview */}
                  <div className="space-y-4 min-w-0 w-full overflow-hidden">
                    <h3 className="text-sm font-medium text-zinc-900 border-b pb-2 flex items-center justify-between">
                      <span>Test Cases Breakdown</span>
                    </h3>

                    <Tabs
                      defaultValue={scenario.sheets[0]?.name}
                      className="w-full min-w-0 max-w-full flex-col flex"
                    >
                      <div className="w-full overflow-x-auto border-b relative">
                        <TabsList className="flex w-max bg-transparent p-0 h-auto gap-6 rounded-none px-1">
                          {scenario.sheets.map(sheet => (
                            <TabsTrigger
                              key={sheet.name}
                              value={sheet.name}
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 pb-2 pt-0 text-zinc-500 data-[state=active]:text-zinc-900 transition-all whitespace-nowrap"
                            >
                              <span className="flex items-center gap-2">
                                {sheet.name}
                                <span className="bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                                  {sheet.testCases.length}
                                </span>
                              </span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </div>

                      {scenario.sheets.map(sheet => (
                        <TabsContent
                          key={sheet.name}
                          value={sheet.name}
                          className="mt-4 outline-none min-w-0"
                        >
                          <div className="border rounded-xl overflow-hidden bg-white shadow-sm min-w-0">
                            <div className="text-xs divide-y divide-zinc-100 min-w-0">
                              {sheet.testCases.map(tc => (
                                <div
                                  key={tc.id}
                                  className="p-4 hover:bg-zinc-50 transition-colors group min-w-0"
                                >
                                  <div className="flex gap-3 min-w-0">
                                    <span className="font-mono font-bold shrink-0 text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded h-fit">
                                      {tc.id}
                                    </span>
                                    <span className="font-medium text-zinc-800 leading-snug flex-1 min-w-0 break-words overflow-hidden">
                                      {tc.name}
                                    </span>
                                  </div>
                                  <div className="text-xs text-zinc-500 mt-2 justify-end flex flex-wrap gap-x-4 gap-y-2 items-center">
                                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                                      <div className="w-1 h-1 rounded-full bg-zinc-300" />
                                      {tc.steps.length} steps
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </div>

                  {/* Generated Recordings Linked */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-zinc-900 border-b pb-2 flex items-center justify-between">
                      <span>Generated Drafts</span>
                      {scenario.generatedTests &&
                        scenario.generatedTests.length > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {scenario.generatedTests.length} Ready
                          </Badge>
                        )}
                    </h3>

                    {scenario.generatedTests &&
                    scenario.generatedTests.length > 0 ? (
                      <div className="grid gap-2">
                        {scenario.generatedTests.map(test => (
                          <div
                            key={test.id}
                            onClick={() => onViewGeneratedId(test.id)}
                            className="p-3 border rounded-lg text-sm bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300 cursor-pointer flex justify-between items-center transition-colors"
                          >
                            <div className="flex flex-col min-w-0 flex-1 mr-2">
                              <span className="font-medium text-zinc-900 truncate">
                                {test.name || 'Untitled Draft'}
                              </span>
                              <span className="font-mono text-[10px] text-zinc-400 truncate">
                                {test.id}
                              </span>
                            </div>
                            <span className="text-blue-600 font-medium shrink-0">
                              View Script &rarr;
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 text-center py-4 border border-dashed rounded-lg bg-zinc-50">
                        No generated test blueprints yet.
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </motion.div>
          ) : (
            <motion.div
              key="selection"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col z-20 bg-white"
            >
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-4">
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 mb-2">
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      Choose which sheets from{' '}
                      <span className="font-semibold text-zinc-900">
                        {scenario.fileName}
                      </span>{' '}
                      you'd like to use for AI test generation.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {scenario.sheets.map(sheet => {
                      const isSelected = selectedSheets.includes(sheet.name);
                      return (
                        <div
                          key={sheet.name}
                          onClick={() => {
                            setSelectedSheets(prev =>
                              prev.includes(sheet.name)
                                ? prev.filter(s => s !== sheet.name)
                                : [...prev, sheet.name]
                            );
                          }}
                          className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? 'border-zinc-900 bg-zinc-50 shadow-sm ring-1 ring-zinc-900'
                              : 'hover:border-zinc-300 bg-white hover:bg-zinc-50/50'
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm text-zinc-900 truncate">
                              {sheet.name}
                            </span>
                            <span className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-zinc-300" />
                              {sheet.testCases.length} Test Cases found
                            </span>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                              isSelected
                                ? 'border-zinc-900 bg-zinc-900 shadow-sm'
                                : 'border-zinc-300 bg-white'
                            }`}
                          >
                            {isSelected && (
                              <Check
                                className="w-3.5 h-3.5 text-white"
                                strokeWidth={3}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t shrink-0 flex flex-col gap-2 bg-zinc-50 z-30">
        <Button
          variant={isSelectingSheets ? 'default' : 'outline'}
          className={`w-full h-11 justify-center rounded-xl transition-all ${
            isSelectingSheets
              ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm'
              : 'text-zinc-900 border-zinc-200 hover:bg-white hover:border-zinc-300'
          }`}
          onClick={handleStartGenerationClick}
          disabled={
            scenario.status === 'generating' ||
            (isSelectingSheets && selectedSheets.length === 0)
          }
        >
          {scenario.status === 'generating' ? (
            'Currently Generating...'
          ) : isSelectingSheets ? (
            `Generate for ${selectedSheets.length} Sheet${selectedSheets.length > 1 ? 's' : ''}`
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" /> Start Test Generation
            </>
          )}
        </Button>

        {!isSelectingSheets ? (
          <Button
            variant="ghost"
            className="w-full h-10 text-red-600 hover:bg-red-50 hover:text-red-700 justify-center rounded-xl transition-colors"
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete Scenario
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="w-full h-10 text-zinc-500 hover:bg-zinc-100 justify-center rounded-xl transition-colors"
            onClick={() => {
              setIsSelectingSheets(false);
              setSelectedSheets([]);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
};
