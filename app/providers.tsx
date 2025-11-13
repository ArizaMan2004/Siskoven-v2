"use client"

import { AuthProvider } from "@/lib/auth-context"
import { ThemeProviderWrapper } from "@/components/theme-provider"
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
      scriptProps={{
        async: true,
        defer: true,
        appendTo: "head",
      }}
    >
      <AuthProvider>
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </AuthProvider>
    </GoogleReCaptchaProvider>
  )
}
