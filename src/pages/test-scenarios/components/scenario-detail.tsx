import React, { useState, useMemo, useRef } from 'react';
import {
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  FileSpreadsheet,
  Target,
  Hash,
  Layers,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
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
  const [draftsSearch, setDraftsSearch] = useState('');
  const [draftsPage, setDraftsPage] = useState(1);
  const [activeTab, setActiveTab] = useState(scenario.sheets[0]?.name || '');
  const [testCasesSearch, setTestCasesSearch] = useState('');
  const [testCasesPage, setTestCasesPage] = useState(1);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const ITEMS_PER_PAGE = 10;
  const TEST_CASES_PER_PAGE = 10;

  // Calculate totals
  const totalTestCases = (scenario.sheets || []).reduce(
    (acc, sheet) => acc + (sheet.testCases?.length || 0),
    0
  );
  const totalSteps = (scenario.sheets || []).reduce(
    (acc, sheet) =>
      acc + (sheet.testCases || []).reduce((sAcc, tc) => sAcc + (tc.steps?.length || 0), 0),
    0
  );
  const sheetCount = scenario.sheets?.length || 0;

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

  // Filter and paginate generated drafts
  const filteredDrafts = useMemo(() => {
    if (!draftsSearch.trim()) return scenario.generatedTests || [];
    const search = draftsSearch.toLowerCase();
    return (scenario.generatedTests || []).filter(
      draft =>
        draft.name?.toLowerCase().includes(search) ||
        draft.id?.toLowerCase().includes(search)
    );
  }, [scenario.generatedTests, draftsSearch]);

  const totalDraftPages = Math.ceil(filteredDrafts.length / ITEMS_PER_PAGE);
  const paginatedDrafts = filteredDrafts.slice(
    (draftsPage - 1) * ITEMS_PER_PAGE,
    draftsPage * ITEMS_PER_PAGE
  );

  const handleDraftsSearch = (value: string) => {
    setDraftsSearch(value);
    setDraftsPage(1);
  };

  // Get current sheet's test cases with search and pagination
  const currentSheet = scenario.sheets.find(s => s.name === activeTab);
  const filteredTestCases = useMemo(() => {
    if (!currentSheet) return [];
    if (!testCasesSearch.trim()) return currentSheet.testCases;
    const search = testCasesSearch.toLowerCase();
    return currentSheet.testCases.filter(
      tc =>
        tc.name?.toLowerCase().includes(search) ||
        tc.id?.toLowerCase().includes(search) ||
        tc.userStory?.toLowerCase().includes(search)
    );
  }, [currentSheet, testCasesSearch]);

  const totalTestCasesPages = Math.ceil(filteredTestCases.length / TEST_CASES_PER_PAGE);
  const paginatedTestCases = filteredTestCases.slice(
    (testCasesPage - 1) * TEST_CASES_PER_PAGE,
    testCasesPage * TEST_CASES_PER_PAGE
  );

  const handleTestCasesSearch = (value: string) => {
    setTestCasesSearch(value);
    setTestCasesPage(1);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setTestCasesPage(1);
    setTestCasesSearch('');
  };

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'generating':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-zinc-50 text-zinc-700 border-zinc-200';
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/30 relative overflow-hidden">
      <AnimatePresence initial={false} mode="wait">
        {!isSelectingSheets ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col w-full overflow-hidden bg-white"
          >
            {/* Full-width Header */}
            <div className="shrink-0">
              {/* Main Header */}
              <div className="px-8 pt-8 pb-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
                      <button
                        onClick={onClose}
                        className="flex items-center gap-1.5 hover:text-zinc-900 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Test Scenarios
                      </button>
                    </div>

                    {/* Title & Status */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <h1
                        className="text-3xl font-semibold tracking-tight text-zinc-900 truncate"
                        title={scenario.fileName}
                      >
                        {scenario.fileName}
                      </h1>
                      <Badge
                        variant="outline"
                        className={cn('capitalize font-medium px-2.5 py-0.5 rounded-full border-zinc-200/60', getStatusColor(scenario.status))}
                      >
                        {scenario.status}
                      </Badge>
                    </div>

                    {/* Project & Metadata */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="truncate font-medium">
                          {scenario.projectName || projectName || 'Unassigned Project'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-medium">
                          Imported {scenario.createdAt
                            ? new Date(scenario.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Recently'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <Button
                      variant="ghost"
                      className="h-10 px-4 hover:bg-red-50 hover:text-red-600 text-red-600 rounded-xl gap-2 transition-colors"
                      onClick={onDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                    <Button
                      className="h-10 px-5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-2 shadow-sm transition-all"
                      onClick={handleStartGenerationClick}
                      disabled={scenario.status === 'generating'}
                    >
                      <Play className="w-4 h-4" />
                      {scenario.status === 'generating' ? 'Generating...' : 'Generate Automation Tests'}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-6 mt-4 pt-4 border-t border-zinc-100/60">
                  <div className="flex flex-col">
                    <p className="text-lg font-semibold text-zinc-900 leading-none">{sheetCount}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-zinc-500">
                      <Layers className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Sheets</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <p className="text-lg font-semibold text-zinc-900 leading-none">{totalTestCases}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-zinc-500">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Test Cases</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <p className="text-lg font-semibold text-zinc-900 leading-none">{totalSteps}</p>
                    <div className="flex items-center gap-1.5 mt-1.5 text-zinc-500">
                      <Hash className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium uppercase tracking-wider">Total Steps</span>
                    </div>
                  </div>
                  {scenario.generatedTests && scenario.generatedTests.length > 0 && (
                    <div className="flex flex-col">
                      <p className="text-lg font-semibold text-zinc-900 leading-none">
                        {scenario.generatedTests.length}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wider">Tests Ready</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Error Banner */}
              {scenario.error && (
                <div className="mx-8 mb-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-red-800">Generation Failed</p>
                    <p className="text-sm text-red-600 mt-1">{scenario.error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <ScrollArea className="flex-1 bg-zinc-50/30 border-t border-zinc-100/60">
              <div className="px-8 py-8 space-y-8 max-w-[1600px] mx-auto w-full">
                {/* Two Column Layout: Test Cases + Generated Automation Tests */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
                  {/* Test Cases Section */}
                  <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-medium tracking-tight text-zinc-900">Test Cases</h2>
                    </div>

                    {/* Sheet Tabs - scrollable */}
                    <div className="overflow-x-auto -mx-8 px-8 pb-1">
                      <Tabs
                        value={activeTab}
                        onValueChange={handleTabChange}
                        className="w-full min-w-max"
                      >
                        <TabsList className="bg-transparent border-b border-zinc-200/60 p-0 h-auto inline-flex w-full justify-start rounded-none space-x-6">
                          {scenario.sheets.map(sheet => (
                            <TabsTrigger
                              key={sheet.name}
                              value={sheet.name}
                              ref={el => {
                                tabRefs.current[sheet.name] = el;
                              }}
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent px-0 py-3 text-sm font-medium text-zinc-500 data-[state=active]:text-zinc-900 data-[state=active]:shadow-none whitespace-nowrap transition-colors"
                            >
                              {sheet.name}
                              <span className="ml-2 bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                {sheet.testCases.length}
                              </span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>

                    {/* Search */}
                    <div className="mt-6 relative">
                      <Input
                        placeholder="Search test cases..."
                        className="pl-10 h-11 bg-white/50 border-zinc-200/60 focus:bg-white rounded-xl text-sm transition-colors"
                        value={testCasesSearch}
                        onChange={e => handleTestCasesSearch(e.target.value)}
                      />
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>

                    {/* Test Cases Tabs Content */}
                    <Tabs
                      value={activeTab}
                      onValueChange={handleTabChange}
                      className="w-full"
                    >
                      {scenario.sheets.map(sheet => (
                        <TabsContent
                          key={sheet.name}
                          value={sheet.name}
                          className="mt-4 outline-none"
                        >
                          {filteredTestCases.length > 0 ? (
                            <div className="mt-4 flex flex-col space-y-2">
                              <div className="flex flex-col gap-2">
                                {paginatedTestCases.map((tc) => (
                                  <div
                                    key={tc.id}
                                    className="p-4 rounded-xl border border-zinc-200/50 bg-white/50 hover:bg-white hover:border-zinc-300/60 hover:shadow-sm transition-all group"
                                  >
                                    <div className="flex items-start gap-4">
                                      <span className="font-mono text-xs font-medium text-zinc-400 bg-zinc-100/50 px-2 py-1 rounded-md shrink-0 border border-zinc-200/50">
                                        {tc.id}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-zinc-900 leading-snug">
                                          {tc.name}
                                        </p>
                                        {tc.userStory && (
                                          <p className="text-sm text-zinc-500 mt-1.5 line-clamp-2">
                                            {tc.userStory}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-3">
                                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-50 border border-zinc-100 text-xs text-zinc-500">
                                            <Layers className="w-3 h-3 text-zinc-400" />
                                            {tc.steps.length} steps
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Pagination */}
                              {totalTestCasesPages > 1 && (
                                <div className="flex items-center justify-between pt-6 pb-2">
                                  <span className="text-sm text-zinc-500">
                                    Showing <span className="font-medium text-zinc-900">{((testCasesPage - 1) * TEST_CASES_PER_PAGE) + 1}</span> to{' '}
                                    <span className="font-medium text-zinc-900">{Math.min(testCasesPage * TEST_CASES_PER_PAGE, filteredTestCases.length)}</span> of{' '}
                                    <span className="font-medium text-zinc-900">{filteredTestCases.length}</span>
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
                                      onClick={() => setTestCasesPage(p => Math.max(1, p - 1))}
                                      disabled={testCasesPage === 1}
                                    >
                                      <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="text-sm font-medium text-zinc-600 w-12 text-center">
                                      {testCasesPage} <span className="text-zinc-400 font-normal">/</span> {totalTestCasesPages}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
                                      onClick={() => setTestCasesPage(p => Math.min(totalTestCasesPages, p + 1))}
                                      disabled={testCasesPage === totalTestCasesPages}
                                    >
                                      <ChevronRightIcon className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-zinc-500 text-center py-16 rounded-2xl bg-zinc-50/50 border border-zinc-200/50">
                              {testCasesSearch
                                ? 'No test cases match your search.'
                                : 'No test cases found in this sheet.'}
                            </div>
                          )}
                        </TabsContent>
                      ))}
                    </Tabs>
                  </div>

                  {/* Generated Automation Tests Section */}
                  <div className="xl:col-span-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-medium tracking-tight text-zinc-900">Generated Automation Tests</h2>
                      {scenario.generatedTests && scenario.generatedTests.length > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100/50">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-700">{scenario.generatedTests.length} Ready</span>
                        </div>
                      )}
                    </div>

                    {/* Search */}
                    {scenario.generatedTests && scenario.generatedTests.length > 0 && (
                      <div className="mt-6 relative">
                        <Input
                          placeholder="Search automation tests..."
                          className="pl-10 h-11 bg-white/50 border-zinc-200/60 focus:bg-white rounded-xl text-sm transition-colors"
                          value={draftsSearch}
                          onChange={e => handleDraftsSearch(e.target.value)}
                        />
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                    )}

                    {filteredDrafts.length > 0 ? (
                      <div className="space-y-3 mt-4">
                        {paginatedDrafts.map(test => (
                          <div
                            key={test.id}
                            onClick={() => onViewGeneratedId(test.id)}
                            className="p-4 border border-zinc-200/50 rounded-xl bg-white/50 hover:bg-white hover:border-zinc-300/60 hover:shadow-sm cursor-pointer transition-all group flex flex-col gap-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-900 truncate group-hover:text-zinc-950 transition-colors">
                                  {test.name || 'Untitled Test'}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="font-mono text-xs text-zinc-400 bg-zinc-100/50 px-2 py-0.5 rounded border border-zinc-200/50 truncate">
                                    {test.id}
                                  </span>
                                </div>
                              </div>
                              <div className="w-6 h-6 rounded-full bg-zinc-50 border border-zinc-100 flex items-center justify-center group-hover:bg-zinc-100 transition-colors shrink-0">
                                <ExternalLink className="w-3 h-3 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Pagination */}
                        {totalDraftPages > 1 && (
                          <div className="flex items-center justify-between pt-4 pb-2">
                            <span className="text-sm font-medium text-zinc-500">
                              <span className="text-zinc-900">{draftsPage}</span> <span className="text-zinc-400 font-normal">/</span> {totalDraftPages}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
                                onClick={() => setDraftsPage(p => Math.max(1, p - 1))}
                                disabled={draftsPage === 1}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
                                onClick={() => setDraftsPage(p => Math.min(totalDraftPages, p + 1))}
                                disabled={draftsPage === totalDraftPages}
                              >
                                <ChevronRightIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500 text-center py-16 rounded-2xl bg-zinc-50/50 border border-zinc-200/50 mt-4">
                        {draftsSearch
                          ? 'No automation tests match your search.'
                          : 'No generated automation tests yet.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </motion.div>
        ) : (
          /* Sheet Selection View */
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col z-20 bg-white"
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-6 border-b border-zinc-100/60 bg-white/50 backdrop-blur-xl">
              <button
                onClick={() => setIsSelectingSheets(false)}
                className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors mb-6"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Details
              </button>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Select Sheets to Generate</h1>
              <p className="text-zinc-500 mt-2.5 text-sm max-w-xl leading-relaxed">
                Choose which sheets from{' '}
                <span className="font-medium text-zinc-900">{scenario.fileName}</span> to use for AI test generation. We'll analyze the selected sheets to create detailed automation tests.
              </p>
            </div>

            <ScrollArea className="flex-1 bg-zinc-50/30">
              <div className="p-8 space-y-4 max-w-4xl mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        className={cn(
                          'flex items-center justify-between p-5 border rounded-xl cursor-pointer transition-all group',
                          isSelected
                            ? 'border-zinc-900 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] ring-1 ring-zinc-900'
                            : 'hover:border-zinc-300 bg-white/60 hover:bg-white hover:shadow-sm border-zinc-200/60'
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-zinc-900 truncate">
                            {sheet.name}
                          </span>
                          <span className="text-sm text-zinc-500 mt-1.5 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-zinc-400" />
                            {sheet.testCases.length} Test Cases
                          </span>
                        </div>
                        <div
                          className={cn(
                            'w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ml-4',
                            isSelected
                              ? 'border-zinc-900 bg-zinc-900 shadow-sm'
                              : 'border-zinc-300 bg-zinc-50 group-hover:border-zinc-400'
                          )}
                        >
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="p-6 border-t border-zinc-100/60 bg-white flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                className="h-10 px-5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 rounded-xl transition-colors font-medium"
                onClick={() => {
                  setIsSelectingSheets(false);
                  setSelectedSheets([]);
                }}
              >
                Cancel
              </Button>
              <Button
                className={cn(
                  'h-10 px-6 rounded-xl gap-2 transition-all font-medium',
                  selectedSheets.length > 0
                    ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm'
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200/60'
                )}
                onClick={handleStartGenerationClick}
                disabled={selectedSheets.length === 0}
              >
                <Play className="w-4 h-4" />
                Generate for {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
