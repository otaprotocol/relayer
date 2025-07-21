"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CodeInput } from "../ui/code-input"
import { CodeDetails } from "../ui/code-details"
import { Alert, AlertDescription } from "../ui/alert"
import { AlertCircle } from "lucide-react"

interface ResolveResponse {
  codeHash: string
  timestamp: number
  expiresAt: number
  remainingInSeconds: number
  status: 'pending' | 'active' | 'expired' | 'finalized' | 'error' | 'resolved'
  pubkey: string
  chain: string
  prefix?: string
  meta?: {
    description?: string
    params?: Record<string, any>
  }
  transaction?: {
    transaction?: string
    txSignature?: string
    txType?: string
  }
}

interface ErrorResponse {
  error: string
  code: string
  message: string
  status: number
}

function InspectPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [code, setCode] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [data, setData] = React.useState<ResolveResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Pre-fill code from URL parameter
  React.useEffect(() => {
    const codeParam = searchParams.get('code')
    if (codeParam) {
      setCode(codeParam)
      // Auto-resolve if code is provided in URL
      handleResolve(codeParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleResolve = async (codeToResolve: string) => {
    if (codeToResolve.length !== 8) {
      setError("Please enter a valid 8-digit code")
      return
    }

    setIsLoading(true)
    setError(null)
    setData(null)

    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: codeToResolve }),
      })

      const result = await response.json()

      if (!response.ok) {
        const errorData = result as ErrorResponse
        setError(errorData.message || 'Failed to resolve code')
        return
      }

      setData(result as ResolveResponse)

      // Update URL with the code parameter
      const newUrl = `/inspect?code=${codeToResolve}`
      router.push(newUrl, { scroll: false })

    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setCode("")
    setData(null)
    setError(null)
    router.push('/inspect', { scroll: false })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Action Codes Inspector
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Enter an action code to inspect its details and status
            </p>
          </div>

          {/* Code Input Section */}
          <div className="flex justify-center">
            <CodeInput
              value={code}
              onChange={setCode}
              onSubmit={handleResolve}
              onClear={handleClear}
              disabled={isLoading}
              isResolved={!!data}
              placeholder="Enter 8-digit action code"
            />
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Resolving action code...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="max-w-md mx-auto">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}

          {/* Success State */}
          {data && !isLoading && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  Code Details
                </h2>
              </div>
              <CodeDetails data={data} />
            </div>
          )}

          {/* Empty State */}
          {!data && !error && !isLoading && code.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>Enter an action code above to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InspectPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <InspectPageContent />
    </React.Suspense>
  )
}