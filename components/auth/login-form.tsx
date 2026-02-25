'use client'

/**
 * Login / Sign-up form with tab switching.
 * Uses React's useActionState for Server Action integration.
 */
import { useActionState, useState } from 'react'
import { signIn, signUp } from '@/lib/actions/auth'
import { Loader2 } from 'lucide-react'


export default function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  const [signInState, signInAction, signInPending] = useActionState(signIn, {})
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, {})

  const isPending = signInPending || signUpPending
  const state = mode === 'signin' ? signInState : signUpState
  const action = mode === 'signin' ? signInAction : signUpAction

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            mode === 'signin'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            mode === 'signup'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Success message */}
      {state.success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
          {state.success}
        </div>
      )}

      {/* Error message */}
      {state.error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-4">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-medium rounded-lg transition-colors mt-2"
        >
          {isPending && <Loader2 size={16} className="animate-spin" />}
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
