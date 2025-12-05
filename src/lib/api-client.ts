export interface ToolExecutionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

class ApiClient {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    async executeTool<T = unknown>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
        const response = await fetch('/api/tools/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ toolName, args }),
        });

        const result: ToolExecutionResult<T> = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Tool execution failed');
        }

        return result.data as T;
    }

    async graphql<T = unknown>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
        const apiUrl = process.env.NEXT_PUBLIC_MANAGER_API_URL || 'https://manager.api.dev.firstdollar.com';
        const response = await fetch(`${apiUrl}/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({ query, variables }),
        });

        const result = await response.json();

        if (result.errors && result.errors.length > 0) {
            throw new Error(result.errors.map((e: { message: string }) => e.message).join('; '));
        }

        return result.data;
    }
}

export function createApiClient(token: string): ApiClient {
    return new ApiClient(token);
}
