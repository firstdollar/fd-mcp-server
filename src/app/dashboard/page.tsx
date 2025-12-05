"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  tools,
  toolsByCategory,
  getToolsByCategoryForAdminType,
  getToolsForAdminType,
  type ToolDefinition,
} from "@/lib/tools/definitions";
import { useAuth } from "@/lib/auth-context";
import { useAdmin } from "@/lib/admin-context";
import { createApiClient } from "@/lib/api-client";
import { Play, CheckCircle2, XCircle, Loader2, Lock } from "lucide-react";

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export default function DashboardPage() {
  const { getIdToken } = useAuth();
  const {
    adminDetails,
    loading: adminLoading,
    isOrgAdmin,
    organizationCode,
  } = useAdmin();
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(false);

  const adminType = adminDetails?.administeredEntity?.administeredEntityType;

  // Filter tools based on admin type
  const filteredToolsByCategory = useMemo(() => {
    if (!adminType) return toolsByCategory;
    return getToolsByCategoryForAdminType(adminType);
  }, [adminType]);

  const filteredTools = useMemo(() => {
    if (!adminType) return tools;
    return getToolsForAdminType(adminType);
  }, [adminType]);

  const handleToolSelect = (tool: ToolDefinition) => {
    setSelectedTool(tool);
    // Auto-fill organizationCode for org admins on org-scoped tools
    if (isOrgAdmin && organizationCode && tool.orgScoped) {
      const schema = tool.inputSchema.shape;
      const initialInputs: Record<string, string> = {};
      // Check for organizationCode field
      if ("organizationCode" in schema) {
        initialInputs["organizationCode"] = organizationCode;
      }
      // Check for organizationCodes array field (e.g., listUsers, listClaims)
      if ("organizationCodes" in schema) {
        initialInputs["organizationCodes"] = organizationCode;
      }
      setInputs(initialInputs);
    } else {
      setInputs({});
    }
    setResult(null);
  };

  const handleInputChange = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleExecute = async () => {
    if (!selectedTool) return;

    setLoading(true);
    setResult(null);

    try {
      const token = await getIdToken();
      if (!token) {
        setResult({
          success: false,
          error: "Failed to get authentication token",
        });
        return;
      }

      const client = createApiClient(token);

      // Parse numeric inputs
      const parsedInputs: Record<string, unknown> = {};
      const schema = selectedTool.inputSchema.shape;

      for (const [key, value] of Object.entries(inputs)) {
        if (value === "") continue;
        const fieldSchema = schema[key];
        if (fieldSchema && "description" in fieldSchema) {
          // Check if it's a number field
          if (fieldSchema._def?.typeName === "ZodNumber") {
            parsedInputs[key] = parseInt(value, 10);
          } else {
            parsedInputs[key] = value;
          }
        } else {
          parsedInputs[key] = value;
        }
      }

      const data = await client.executeTool(selectedTool.name, parsedInputs);
      setResult({ success: true, data });
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInputFields = (tool: ToolDefinition) => {
    const schema = tool.inputSchema.shape;
    return Object.entries(schema).map(([key, value]) => {
      const isOptional = value.isOptional?.() ?? false;
      const description =
        "description" in value ? (value.description as string) : "";
      return { key, isOptional, description };
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Execute MCP tools and view results
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tool List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold">Available Tools</h2>
          {adminLoading ? (
            <Card>
              <CardContent className="py-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            Object.entries(filteredToolsByCategory).map(
              ([category, categoryTools]) => (
                <Card key={category}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">
                      {category}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 pb-3">
                    <div className="space-y-1">
                      {categoryTools.map((tool) => (
                        <Button
                          key={tool.name}
                          variant={
                            selectedTool?.name === tool.name
                              ? "secondary"
                              : "ghost"
                          }
                          className="w-full justify-start text-sm h-auto py-2"
                          onClick={() => handleToolSelect(tool)}
                        >
                          <span className="truncate">{tool.name}</span>
                          {tool.orgScoped && isOrgAdmin && (
                            <Lock className="h-3 w-3 ml-auto text-muted-foreground" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            )
          )}
        </div>

        {/* Tool Execution */}
        <div className="lg:col-span-2 space-y-4">
          {selectedTool ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{selectedTool.name}</CardTitle>
                  <CardDescription>{selectedTool.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {getInputFields(selectedTool).map(
                    ({ key, isOptional, description }) => {
                      // Check if this field should be locked for org admins
                      const isOrgScopedField =
                        isOrgAdmin &&
                        selectedTool.orgScoped &&
                        (key === "organizationCode" ||
                          key === "organizationCodes");

                      return (
                        <div key={key} className="space-y-2">
                          <label className="text-sm font-medium">
                            {key}
                            {isOptional && (
                              <span className="text-muted-foreground ml-1">
                                (optional)
                              </span>
                            )}
                            {isOrgScopedField && (
                              <span className="text-muted-foreground ml-1 inline-flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                (auto-filled)
                              </span>
                            )}
                          </label>
                          <Input
                            placeholder={description}
                            value={inputs[key] || ""}
                            onChange={(e) =>
                              handleInputChange(key, e.target.value)
                            }
                            disabled={isOrgScopedField}
                            className={isOrgScopedField ? "bg-muted" : ""}
                          />
                          {description && (
                            <p className="text-xs text-muted-foreground">
                              {description}
                            </p>
                          )}
                        </div>
                      );
                    }
                  )}

                  <Button
                    onClick={handleExecute}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Execute
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Results */}
              {result && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {result.success ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          Success
                        </>
                      ) : (
                        <>
                          <XCircle className="h-5 w-5 text-red-500" />
                          Error
                        </>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm max-h-96">
                      {result.success
                        ? JSON.stringify(result.data, null, 2)
                        : result.error}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a tool from the list to get started
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{filteredTools.length}</div>
            <p className="text-xs text-muted-foreground">Available Tools</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {Object.keys(filteredToolsByCategory).length}
            </div>
            <p className="text-xs text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">Manager</div>
            <p className="text-xs text-muted-foreground">API Type</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {adminLoading ? "..." : isOrgAdmin ? "Org" : "Partner"}
            </div>
            <p className="text-xs text-muted-foreground">Admin Type</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
