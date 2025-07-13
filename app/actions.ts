"use server"

import { redirect } from "next/navigation"

export async function generateWebsite(formData: FormData) {
  const prompt = formData.get("prompt") as string

  // In a real app, you would process the prompt here
  // For now, we'll just redirect with the data as URL params
  const params = new URLSearchParams({
    prompt: prompt,
  })

  redirect(`/generate?${params.toString()}`)
}
