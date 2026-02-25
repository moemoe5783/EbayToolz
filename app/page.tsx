/**
 * Root page — redirect to /dashboard (middleware handles auth).
 */
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/dashboard')
}
