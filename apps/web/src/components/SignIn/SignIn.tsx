/**
 * Sign-in card -- thin wrapper around Clerk's prebuilt component.
 *
 * Strategies (Google, Microsoft Entra, Microsoft consumer, email-code)
 * are toggled in the Clerk dashboard, NOT here. The component below
 * renders whatever the dashboard configures, so adding/removing IdPs
 * is a zero-code change.
 */

import { SignIn as ClerkSignIn } from '@clerk/clerk-react'

export function SignIn() {
  return (
    <div className="card">
      <ClerkSignIn routing="hash" />
    </div>
  )
}
