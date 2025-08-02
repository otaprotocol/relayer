// Copyright 2025 Trana, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use client"

import * as React from "react"
import { Input } from "./input"
import { Button } from "./button"
import { cn } from "../utils"
import { CODE_LENGTH, CodeGenerator, MAX_PREFIX_LENGTH } from "@actioncodes/protocol"

interface CodeInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onClear?: () => void
  disabled?: boolean
  isResolved?: boolean
  className?: string
  placeholder?: string
}

export function CodeInput({
  value,
  onChange,
  onSubmit,
  onClear,
  disabled = false,
  isResolved = false,
  className,
  placeholder = "Enter 8-digit action code"
}: CodeInputProps) {
  const [isValid, setIsValid] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Validate code format when value changes
  React.useEffect(() => {
    if (value.length === 0) {
      setIsValid(false)
      setError(null)
      return
    }

    try {
      const valid = CodeGenerator.validateCodeFormat(value)
      setIsValid(valid)
      setError(valid ? null : "Invalid code format")
    } catch {
      setIsValid(false)
      setError("Invalid code format")
    }
  }, [value])

  const handleSubmit = () => {
    if (isValid && onSubmit) {
      onSubmit(value)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleSubmit()
    }
  }

  const handleClear = () => {
    if (onClear) {
      onClear()
    }
  }

  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="flex w-full max-w-md items-center gap-2 mx-auto">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={CODE_LENGTH + MAX_PREFIX_LENGTH}
          className="text-center"
          aria-invalid={!!error}
        />
        <Button
          onClick={isResolved ? handleClear : handleSubmit}
          disabled={disabled || (!isResolved && (!isValid || value.length === 0))}
          variant="secondary"
          color="primary"
        >
          {disabled ? 'Resolving...' : isResolved ? 'Clear' : 'Resolve'}
        </Button>
      </div>

      {/* Validation messages */}
      {error && (
        <div className="text-center">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      )}
      
      {!error && value.length > 0 && isValid && (
        <div className="text-center">
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Valid code format</p>
        </div>
      )}
    </div>
  )
}
