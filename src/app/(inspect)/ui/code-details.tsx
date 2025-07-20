"use client"

import * as React from "react"
import { cn } from "../utils"
import { ExternalLink, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react"

interface CodeDetailsProps {
  data: {
    codeHash: string
    issuedAt: number
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
  className?: string
}

export function CodeDetails({ data, className }: CodeDetailsProps) {
  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return "Expired"
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'finalized':
        return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'resolved':
        return <CheckCircle className="h-4 w-4 text-purple-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const getSolscanUrl = (type: 'account' | 'tx', address: string) => {
    return `https://solscan.io/${type}/${address}`
  }

  const truncateAddress = (address: string, length: number = 8) => {
    if (address.length <= length * 2) return address
    return `${address.slice(0, length)}...${address.slice(-length)}`
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Code Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">🔍 Code</span>
              <span className="font-mono text-sm">
                {data.codeHash.slice(0, 8)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">🔗 Prefix</span>
              <span className="text-sm">{data.prefix || 'DEFAULT'}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">🧾 Status</span>
              <div className="flex items-center gap-2">
                {getStatusIcon(data.status)}
                <span className="text-sm capitalize">{data.status}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">⏳ Expires In</span>
              <span className="text-sm font-mono">
                {formatDuration(data.remainingInSeconds)}
              </span>
            </div>
          </div>

          {/* Wallet Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">👤 Wallet</span>
              <a
                href={getSolscanUrl('account', data.pubkey)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                {truncateAddress(data.pubkey)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">🌐 Chain</span>
              <span className="text-sm capitalize">{data.chain}</span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Transaction Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">🧠 Transaction</span>
              <span className="text-sm">
                {data.transaction?.txSignature ? 'Attached' : 'Not Attached'}
              </span>
            </div>

            {data.transaction?.txSignature && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">🔍 Signature</span>
                  <a
                    href={getSolscanUrl('tx', data.transaction.txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    {truncateAddress(data.transaction.txSignature, 6)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Metadata */}
          {data.meta && (
            <div className="space-y-3">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">📝 Metadata</span>

              {data.meta.description && (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {data.meta.description}
                </div>
              )}

              {data.meta.params && Object.keys(data.meta.params).length > 0 && (
                <div className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded font-mono">
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(data.meta.params, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error Section (if any) */}
      {data.status === 'expired' && (
        <div className="border border-red-200 dark:border-red-800 rounded p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">Code has expired</span>
          </div>
        </div>
      )}

      {data.status === 'error' && (
        <div className="border border-red-200 dark:border-red-800 rounded p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">Error occurred while processing code</span>
          </div>
        </div>
      )}
    </div>
  )
}
