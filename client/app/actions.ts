"use server"

import { redirect } from "next/navigation"

export async function generateWebsite(formData: FormData) {
  const prompt = formData.get("prompt") as string
  const mode = (formData.get("mode") as string) || "auto"

  const params = new URLSearchParams({
    prompt: prompt,
    mode: mode,
  })

  redirect(`/generate?${params.toString()}`)
}
