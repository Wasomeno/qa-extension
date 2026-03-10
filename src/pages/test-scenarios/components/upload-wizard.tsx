import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, X, File as FileIcon, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProjects } from '@/api/project';
import { testScenarioApi } from '@/api/test-scenario';
import { AuthConfig, TestScenario } from '@/types/test-scenario';
import { SearchablePicker } from '@/pages/issues/components/searchable-picker';

interface UploadWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  portalContainer?: HTMLElement | null;
}

export const UploadWizard: React.FC<UploadWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  portalContainer,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState<string>('');

  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    baseUrl: '',
    loginUrl: '',
    username: '',
    password: '',
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadedScenario, setUploadedScenario] = useState<{
    id: string;
    sheets: number;
  } | null>(null);
  const [scenarioDetails, setScenarioDetails] = useState<TestScenario | null>(
    null
  );

  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const { data: projectsData } = useQuery({
    queryKey: ['projects', projectSearch],
    queryFn: () => getProjects(projectSearch),
  });
  const projects = projectsData?.data?.projects || [];

  const handleUpload = async () => {
    if (!file || !projectId || !authConfig.baseUrl || !authConfig.username)
      return;

    try {
      setIsUploading(true);
      const res = await testScenarioApi.uploadScenario(
        file,
        projectId,
        authConfig
      );

      setUploadedScenario(res);
      // Fetch the full scenario to see sheets
      const details = await testScenarioApi.getScenario(res.id);
      setScenarioDetails(details);

      if (details.sheets && details.sheets.length > 0) {
        setSelectedSheets([details.sheets[0].name]);
      }

      setStep(2);
    } catch (err) {
      console.error('Failed to upload', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!uploadedScenario?.id || selectedSheets.length === 0) return;
    try {
      setIsGenerating(true);
      await testScenarioApi.generateTests(uploadedScenario.id, selectedSheets);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to start generation', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 font-sans">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Generate Test from AI</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>1. Test Scenario Excel file</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-zinc-50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 text-zinc-400 mb-2" />
                  <p className="text-sm font-medium text-zinc-900">
                    {file ? file.name : 'Click to upload XLSX'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">.xlsx, .xls</p>
                  <input
                    ref={fileInputRef}
                    id="file-upload"
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={e => e.target.files && setFile(e.target.files[0])}
                  />
                </div>
              </div>

              <div className="space-y-2 w-full">
                <Label>2. Target App Source Code Project</Label>
                <div className="relative pl-1">
                  <SearchablePicker
                    options={projects.map(p => ({
                      label: p.name_with_namespace || p.name,
                      value: p.id.toString(),
                    }))}
                    value={projectId}
                    onSelect={val => setProjectId(val as string)}
                    placeholder="Select GitLab Project..."
                    searchPlaceholder="Search projects by name..."
                    portalContainer={portalContainer}
                    onSearchChange={setProjectSearch}
                    shouldFilter={false}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px bg-zinc-200 flex-1" />
                  <span className="text-xs text-zinc-500 font-medium">
                    Auth Constraints
                  </span>
                  <div className="h-px bg-zinc-200 flex-1" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Base URL</Label>
                    <Input
                      placeholder="https://app.dev.com"
                      value={authConfig.baseUrl}
                      onChange={e =>
                        setAuthConfig({
                          ...authConfig,
                          baseUrl: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Login URL</Label>
                    <Input
                      placeholder="https://app.dev.com/login"
                      value={authConfig.loginUrl}
                      onChange={e =>
                        setAuthConfig({
                          ...authConfig,
                          loginUrl: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Test Username</Label>
                    <Input
                      placeholder="admin"
                      value={authConfig.username}
                      onChange={e =>
                        setAuthConfig({
                          ...authConfig,
                          username: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Test Password</Label>
                    <Input
                      type="password"
                      placeholder="******"
                      value={authConfig.password}
                      onChange={e =>
                        setAuthConfig({
                          ...authConfig,
                          password: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-green-50 text-green-700 rounded-lg border border-green-100">
                <Check className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Scenario Parsed Successfully
                  </p>
                  <p className="text-xs mt-0.5 opacity-80">
                    Found {scenarioDetails?.sheets.length} sheets in{' '}
                    {scenarioDetails?.fileName}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Select Sheets to Generate</Label>
                <div className="grid grid-cols-1 gap-2">
                  {scenarioDetails?.sheets.map(sheet => {
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
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900'
                            : 'hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm text-zinc-900">
                            {sheet.name}
                          </span>
                          <span className="text-xs text-zinc-500 mt-0.5">
                            {sheet.testCases.length} Test Cases found
                          </span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'border-zinc-900 bg-zinc-900 shadow-sm'
                              : 'border-zinc-300'
                          }`}
                        >
                          {isSelected && (
                            <Check
                              className="w-3 h-3 text-white"
                              strokeWidth={3}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t shrink-0 flex justify-end gap-3 bg-zinc-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUploading || isGenerating}
          >
            Cancel
          </Button>

          {step === 1 ? (
            <Button
              onClick={handleUpload}
              disabled={
                !file ||
                !projectId ||
                !authConfig.baseUrl ||
                !authConfig.username ||
                isUploading
              }
              className="bg-zinc-900 text-white min-w-[120px]"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Next'
              )}
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={selectedSheets.length === 0 || isGenerating}
              className="bg-zinc-900 text-white min-w-[120px]"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Start AI Output'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
