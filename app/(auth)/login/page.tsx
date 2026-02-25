import type { Metadata } from 'next'
import LoginForm from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Sign In — EbayToolz',
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; redirectTo?: string }
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 text-white text-2xl font-bold mb-4 shadow-lg">
            ET
          </div>
          <h1 className="text-3xl font-bold text-gray-900">EbayToolz</h1>
          <p className="text-gray-500 mt-1">Dropshipping management, simplified.</p>
        </div>

        {/* Auth error from callback */}
        {searchParams.error === 'auth_callback_failed' && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
            Authentication failed. Please try again.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <LoginForm redirectTo={searchParams.redirectTo} />
        </div>
      </div>
    </div>
  )
}
