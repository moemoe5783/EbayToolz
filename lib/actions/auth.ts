'use server'

/**
 * Server Actions for Supabase Authentication.
 * All actions redirect on success/failure and never expose raw errors.
 */
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Validation schemas ───────────────────────────────────────────────────────

const authSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// ─── Sign In ──────────────────────────────────────────────────────────────────

export type AuthState = {
  error?: string
  success?: string
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = authSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: 'Invalid email or password. Please try again.' }
  }

  redirect('/dashboard')
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = authSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'An account with this email already exists.' }
    }
    return { error: 'Failed to create account. Please try again.' }
  }

  return {
    success:
      'Account created! Check your email to confirm your address before signing in.',
  }
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
