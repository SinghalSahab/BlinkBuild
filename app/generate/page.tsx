import GenerationContent from "./generation-content"
import { Suspense } from "react"

export default function GeneratePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GenerationContent />
    </Suspense>
  )
}
